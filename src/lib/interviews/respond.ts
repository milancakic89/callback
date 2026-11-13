import "server-only";
import { env } from "@/lib/env";
import { accessTokenFor } from "@/lib/google/connection";
import { addAttendee, deleteEvent } from "@/lib/google/calendar";
import { sendInterviewResponseEmail } from "@/lib/mail";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatInterviewTime } from "./format";
import { effectiveStatus } from "./schedule";
import { fromPgBytea, tokenMatches } from "./token";
import { isInterviewStatus, type InterviewStatus } from "./types";

// The candidate's side of an invitation (features/interview-invitations.md): what the email link's page
// shows, and what Confirm and Decline do. Both read the row with the secret-key client, because the
// candidate has no session on the page and can't read the table anyway; what lets them in is the token
// from their email, or, signed in on /applications, being the application's candidate.

type InvitationRow = {
  id: string;
  status: string;
  starts_at: string;
  duration_minutes: number;
  time_zone: string;
  message: string | null;
  expires_at: string;
  token_hash: string;
  google_event_id: string | null;
  meet_url: string | null;
  company_id: string;
  application: {
    id: string;
    job_posting_id: string;
    candidate_id: string;
    withdrawn_at: string | null;
    candidate: { full_name: string } | null;
    job: { title: string; company: { name: string | null; slug: string | null; owner_id: string } | null } | null;
  } | null;
};

const SELECT =
  "id, status, starts_at, duration_minutes, time_zone, message, expires_at, token_hash, google_event_id, meet_url, company_id, " +
  "application:job_applications(id, job_posting_id, candidate_id, withdrawn_at, candidate:candidate_profiles(full_name), job:job_postings(title, company:companies(name, slug, owner_id)))";

// Who is answering: the token from the email, or the signed-in candidate.
export type Proof = { kind: "token"; token: string } | { kind: "candidate"; userId: string };

async function loadRow(invitationId: string, proof: Proof): Promise<InvitationRow | null> {
  const { data, error } = await supabaseAdmin.from("interview_invitations").select(SELECT).eq("id", invitationId).maybeSingle<InvitationRow>();
  if (error) throw new Error(`loadRow: ${error.message}`);
  if (!data?.application) return null;

  if (proof.kind === "candidate") return data.application.candidate_id === proof.userId ? data : null;
  const stored = fromPgBytea(data.token_hash);
  return stored && tokenMatches(proof.token, stored) ? data : null;
}

// What the page shows. `state` is the invitation's effective status, or "unavailable" once the
// candidate has withdrawn the application.
export type InvitationView = {
  id: string;
  state: InterviewStatus | "unavailable";
  companyName: string;
  jobTitle: string;
  startsAt: string;
  durationMinutes: number;
  timeZone: string;
  message: string | null;
  expiresAt: string;
  // Only once confirmed.
  meetUrl: string | null;
};

function toView(row: InvitationRow, now: Date): InvitationView {
  const status = isInterviewStatus(row.status) ? row.status : "cancelled";
  const state = row.application?.withdrawn_at ? "unavailable" : effectiveStatus(status, row.expires_at, now);
  const company = row.application?.job?.company;
  return {
    id: row.id,
    state,
    companyName: company?.name ?? company?.slug ?? "The company",
    jobTitle: row.application?.job?.title ?? "the job",
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    timeZone: row.time_zone,
    message: row.message,
    expiresAt: row.expires_at,
    meetUrl: status === "confirmed" ? row.meet_url : null,
  };
}

// The invitation behind a link, or null when the id or the token is wrong: the page answers 404, which
// says nothing about which invitations exist.
export async function loadInvitationView(invitationId: string, proof: Proof): Promise<InvitationView | null> {
  const row = await loadRow(invitationId, proof);
  return row ? toView(row, new Date()) : null;
}

export type AnswerResult =
  | { ok: true; response: "confirmed" | "declined"; view: InvitationView }
  // `view` is how the invitation stands now, so the page can say why: answered already, closed, cancelled.
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "closed"; view: InvitationView };

async function emailOf(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

// Confirm or Decline. The row changes in one conditional update (still pending, still before its
// deadline), so two answers, or an answer racing the expiry job, can't both win. Then, best effort: the
// candidate becomes a guest of the event (confirm) or the event goes (decline), and the company is told.
// The answer is kept whatever Google does: that is what Callback is for.
export async function answerInvitation(invitationId: string, response: "confirm" | "decline", proof: Proof): Promise<AnswerResult> {
  const row = await loadRow(invitationId, proof);
  if (!row?.application) return { ok: false, reason: "not_found" };

  const now = new Date();
  const view = toView(row, now);
  if (view.state !== "pending") return { ok: false, reason: "closed", view };

  const status = response === "confirm" ? "confirmed" : "declined";
  const { data: updated, error } = await supabaseAdmin
    .from("interview_invitations")
    .update({ status, responded_at: now.toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .gt("expires_at", now.toISOString())
    .select("id");
  if (error) throw new Error(`answerInvitation: ${error.message}`);
  if (!updated?.length) {
    const fresh = await loadRow(invitationId, proof);
    return fresh ? { ok: false, reason: "closed", view: toView(fresh, new Date()) } : { ok: false, reason: "not_found" };
  }

  const application = row.application;
  const company = application.job?.company;
  let calendarInviteFailed = false;
  try {
    const accessToken = await accessTokenFor(row.company_id);
    if (row.google_event_id) {
      if (status === "confirmed") {
        const candidateEmail = await emailOf(application.candidate_id);
        if (!candidateEmail) throw new Error("the candidate has no email address");
        await addAttendee(accessToken, row.google_event_id, candidateEmail);
      } else {
        await deleteEvent(accessToken, row.google_event_id, false);
      }
    }
  } catch (googleError) {
    console.error("answerInvitation: the calendar step failed:", googleError);
    calendarInviteFailed = true;
  }

  try {
    const ownerEmail = company ? await emailOf(company.owner_id) : null;
    if (ownerEmail && company?.slug) {
      await sendInterviewResponseEmail({
        to: ownerEmail,
        candidateName: application.candidate?.full_name ?? "A candidate",
        jobTitle: application.job?.title ?? "the job",
        response: status,
        when: formatInterviewTime(row.starts_at, row.time_zone),
        meetUrl: row.meet_url,
        calendarInviteFailed: status === "confirmed" && calendarInviteFailed,
        reviewUrl: `${env.APP_URL}/${company.slug}/jobs/${application.job_posting_id}/review?candidate=${application.id}`,
      });
    }
  } catch (mailError) {
    console.error("answerInvitation: telling the company failed:", mailError);
  }

  return { ok: true, response: status, view: { ...view, state: status, meetUrl: status === "confirmed" ? row.meet_url : null } };
}
