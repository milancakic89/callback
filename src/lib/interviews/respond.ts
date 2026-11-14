import "server-only";
import { env } from "@/lib/env";
import { accessTokenFor, getGoogleStatus } from "@/lib/google/connection";
import { addAttendee, deleteEvent } from "@/lib/google/calendar";
import { sendInterviewConfirmedEmail, sendInterviewResponseEmail } from "@/lib/mail";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatDuration, formatInterviewTime } from "./format";
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
  // The Google address the calendar invitation comes from, so the candidate knows where to look in Spam.
  // Only once confirmed, and null when it can't be read.
  organizerEmail: string | null;
};

// `organizerEmail` is read by the caller (see organizerEmailOf), so this stays a plain function.
function toView(row: InvitationRow, now: Date, organizerEmail: string | null): InvitationView {
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
    organizerEmail: status === "confirmed" ? organizerEmail : null,
  };
}

// The company's connected Google address. An error reading it gives null: it only decorates the page and
// the email, and must never break either.
async function organizerEmailOf(companyId: string): Promise<string | null> {
  try {
    return (await getGoogleStatus(companyId)).email;
  } catch (error) {
    console.error("organizerEmailOf: reading the Google connection failed:", error);
    return null;
  }
}

// The address is only worth reading for an invitation that is confirmed.
async function organizerEmailIfConfirmed(row: InvitationRow): Promise<string | null> {
  return row.status === "confirmed" ? organizerEmailOf(row.company_id) : null;
}

// The invitation behind a link, or null when the id or the token is wrong: the page answers 404, which
// says nothing about which invitations exist.
export async function loadInvitationView(invitationId: string, proof: Proof): Promise<InvitationView | null> {
  const row = await loadRow(invitationId, proof);
  return row ? toView(row, new Date(), await organizerEmailIfConfirmed(row)) : null;
}

export type AnswerResult =
  | { ok: true; response: "confirmed" | "declined"; view: InvitationView }
  // `view` is how the invitation stands now, so the page can say why: answered already, closed, cancelled.
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "closed"; view: InvitationView };

// A user's email address, or null when it can't be read: what needs it is best effort, after the answer is saved.
async function emailOf(userId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch (error) {
    console.error("emailOf: reading the user failed:", error);
    return null;
  }
}

// Confirm or Decline. The row changes in one conditional update (still pending, still before its
// deadline), so two answers, or an answer racing the expiry job, can't both win. Then, best effort: the
// candidate becomes a guest of the event (confirm) or the event goes (decline), and the company is told.
// A candidate who confirms gets an email of their own too, with the time and the Meet link, because
// Google's invitation can end up in Spam. The answer is kept whatever Google or the mail does: that is
// what Callback is for.
export async function answerInvitation(invitationId: string, response: "confirm" | "decline", proof: Proof): Promise<AnswerResult> {
  const row = await loadRow(invitationId, proof);
  if (!row?.application) return { ok: false, reason: "not_found" };

  const now = new Date();
  const view = toView(row, now, await organizerEmailIfConfirmed(row));
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
    return fresh
      ? { ok: false, reason: "closed", view: toView(fresh, new Date(), await organizerEmailIfConfirmed(fresh)) }
      : { ok: false, reason: "not_found" };
  }

  const application = row.application;
  const company = application.job?.company;
  // Read once, for the guest of the event and for the candidate's own email.
  const candidateEmail = status === "confirmed" ? await emailOf(application.candidate_id) : null;
  let calendarInviteFailed = false;
  try {
    const accessToken = await accessTokenFor(row.company_id);
    if (row.google_event_id) {
      if (status === "confirmed") {
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

  const organizerEmail = status === "confirmed" ? await organizerEmailOf(row.company_id) : null;
  const when = formatInterviewTime(row.starts_at, row.time_zone);

  try {
    const ownerEmail = company ? await emailOf(company.owner_id) : null;
    if (ownerEmail && company?.slug) {
      await sendInterviewResponseEmail({
        to: ownerEmail,
        candidateName: application.candidate?.full_name ?? "A candidate",
        jobTitle: application.job?.title ?? "the job",
        response: status,
        when,
        meetUrl: row.meet_url,
        calendarInviteFailed: status === "confirmed" && calendarInviteFailed,
        reviewUrl: `${env.APP_URL}/${company.slug}/jobs/${application.job_posting_id}/review?candidate=${application.id}`,
      });
    }
  } catch (mailError) {
    console.error("answerInvitation: telling the company failed:", mailError);
  }

  if (candidateEmail) {
    try {
      await sendInterviewConfirmedEmail({
        to: candidateEmail,
        candidateName: application.candidate?.full_name ?? "there",
        companyName: view.companyName,
        jobTitle: view.jobTitle,
        when,
        duration: formatDuration(row.duration_minutes),
        meetUrl: row.meet_url,
        organizerEmail,
        calendarInviteFailed,
      });
    } catch (mailError) {
      console.error("answerInvitation: the candidate's confirmation email failed:", mailError);
    }
  }

  return {
    ok: true,
    response: status,
    view: { ...view, state: status, meetUrl: status === "confirmed" ? row.meet_url : null, organizerEmail },
  };
}
