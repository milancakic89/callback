import "server-only";
import { env } from "@/lib/env";
import { accessTokenFor, GoogleUnavailableError, ownCompanyId } from "@/lib/google/connection";
import { createInterviewEvent, deleteEvent } from "@/lib/google/calendar";
import { sendInterviewInvitationEmail } from "@/lib/mail";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";
import { cancelInvitation } from "./cancel";
import { formatDeadline, formatDuration, formatInterviewTime } from "./format";
import { effectiveStatus, startProblem, START_PROBLEM_MESSAGES, type InterviewRequest } from "./schedule";
import { generateInviteToken, toPgBytea } from "./token";
import type { Interview, InterviewStatus } from "./types";

// Sends an interview invitation (features/interview-invitations.md): the row in the database, the Google
// Meet event in the company's calendar, and the email to the candidate. Called by the Server Actions
// that apply statuses and by the review screen's "Send invitation". Each step that fails undoes the ones
// before it, so no invitation is left that the candidate can't see, and no event that no row owns.

export type InviteOutcome =
  | { applicationId: string; ok: true; interview: Interview }
  | { applicationId: string; ok: false; error: string };

// The most invitations a company sends in an hour: far above what a review needs, and a limit on what
// a stolen session could do with a company's calendar and our sender address.
const INVITATIONS_PER_HOUR = 30;

type ApplicationRow = {
  id: string;
  job_posting_id: string;
  candidate_id: string;
  candidate: { full_name: string } | null;
  job: { title: string } | null;
};

// What the database's own messages mean to the employer (create_interview_invitation()).
function databaseMessage(error: { code?: string; message: string }): string {
  if (error.message === "application_not_found") return "That application isn't available for an invitation.";
  if (error.message === "not_interview_step") {
    return "Move the candidate to an interview step and apply the status first.";
  }
  if (error.code === "23505") return "An invitation is already open for this candidate. Cancel it first.";
  if (error.code === "23514") return "That time isn't allowed. Choose a time from 3 hours to 90 days from now.";
  console.error("create_interview_invitation failed:", error.code, error.message);
  return "Could not create the invitation. Try again.";
}

export async function sendInterviewInvitation(userId: string, request: InterviewRequest): Promise<InviteOutcome> {
  const fail = (error: string): InviteOutcome => ({ applicationId: request.applicationId, ok: false, error });

  const startsAt = new Date(request.startsAt);
  const problem = startProblem(startsAt, new Date());
  if (problem) return fail(START_PROBLEM_MESSAGES[problem]);

  const { success } = await rateLimit({
    key: `interview-invite:${userId}`,
    limit: INVITATIONS_PER_HOUR,
    windowMs: 60 * 60_000,
    store: postgresStore,
  });
  if (!success) return fail("Too many invitations. Try again in an hour.");

  // The calendar first: with no Google connection nothing is written.
  const companyId = await ownCompanyId();
  if (!companyId) return fail("Set up your company first.");
  let accessToken: string;
  try {
    accessToken = await accessTokenFor(companyId);
  } catch (error) {
    if (error instanceof GoogleUnavailableError) return fail(error.message);
    console.error("accessTokenFor failed:", error);
    return fail("Could not reach Google. Try again.");
  }

  // Read with the employer's own client: row level security shows only their company's applications.
  const supabase = await createClient();
  const { data: application, error: applicationError } = await supabase
    .from("job_applications")
    .select("id, job_posting_id, candidate_id, candidate:candidate_profiles(full_name), job:job_postings(title)")
    .eq("id", request.applicationId)
    .is("withdrawn_at", null)
    .maybeSingle<ApplicationRow>();
  if (applicationError) {
    console.error("sendInterviewInvitation: reading the application failed:", applicationError.message);
    return fail("Could not create the invitation. Try again.");
  }
  if (!application) return fail("That application isn't available for an invitation.");

  const candidateName = application.candidate?.full_name ?? "the candidate";
  const jobTitle = application.job?.title ?? "the job";

  const { data: candidateUser } = await supabaseAdmin.auth.admin.getUserById(application.candidate_id);
  const candidateEmail = candidateUser?.user?.email;
  if (!candidateEmail) return fail("That candidate has no email address to write to.");

  const { data: company } = await supabase.from("companies").select("name, slug").eq("id", companyId).maybeSingle<{ name: string | null; slug: string | null }>();
  const companyName = company?.name ?? company?.slug ?? "The company";

  // One open invitation per application. One whose deadline passed (the expiry job may not have run yet)
  // is closed here so a new one can go out; one still open has to be cancelled first.
  const { data: open, error: openError } = await supabase
    .from("interview_invitations")
    .select("id, status, expires_at")
    .eq("application_id", request.applicationId)
    .in("status", ["pending", "confirmed"])
    .maybeSingle<{ id: string; status: string; expires_at: string }>();
  if (openError) {
    console.error("sendInterviewInvitation: reading open invitations failed:", openError.message);
    return fail("Could not create the invitation. Try again.");
  }
  if (open) {
    if (effectiveStatus(open.status as InterviewStatus, open.expires_at, new Date()) !== "expired") {
      return fail("An invitation is already open for this candidate. Cancel it first.");
    }
    const closed = await cancelInvitation(supabase, open.id);
    if (!closed.ok) return fail(closed.error);
  }

  const { token, hash } = generateInviteToken();
  const { data: created, error: createError } = await supabase
    .rpc("create_interview_invitation", {
      p_application_id: request.applicationId,
      p_starts_at: startsAt.toISOString(),
      p_duration_minutes: request.durationMinutes,
      p_time_zone: request.timeZone,
      p_message: request.message ?? null,
      p_token_hash: toPgBytea(hash),
    })
    .single<{ invitation_id: string; deadline: string }>();
  if (createError || !created) return fail(databaseMessage(createError ?? { message: "no row" }));
  const invitationId = created.invitation_id;

  // Takes the invitation back out: cancelled in the database, and the event gone if it was made.
  const undo = async (eventId: string | null) => {
    if (eventId) await deleteEvent(accessToken, eventId, false).catch((error) => console.error("undo: deleting the event failed:", error));
    const { error } = await supabase.rpc("cancel_interview_invitation", { p_invitation_id: invitationId });
    if (error) console.error("undo: cancelling the invitation failed:", error.message);
  };

  let event: { eventId: string; meetUrl: string };
  try {
    event = await createInterviewEvent(accessToken, {
      summary: `Interview: ${candidateName} (${jobTitle})`,
      description: `Interview for ${jobTitle}, scheduled with Callback.`,
      startsAt,
      durationMinutes: request.durationMinutes,
      timeZone: request.timeZone,
      requestId: invitationId,
    });
  } catch (error) {
    console.error("createInterviewEvent failed:", error);
    await undo(null);
    return fail("Could not create the Google Meet event. Try again.");
  }

  const { error: attachError } = await supabaseAdmin
    .from("interview_invitations")
    .update({ google_event_id: event.eventId, meet_url: event.meetUrl })
    .eq("id", invitationId);
  if (attachError) {
    console.error("attaching the event failed:", attachError.message);
    await undo(event.eventId);
    return fail("Could not create the invitation. Try again.");
  }

  try {
    await sendInterviewInvitationEmail({
      to: candidateEmail,
      candidateName,
      companyName,
      jobTitle,
      when: formatInterviewTime(startsAt, request.timeZone),
      duration: formatDuration(request.durationMinutes),
      deadline: formatDeadline(created.deadline, request.timeZone),
      message: request.message ?? null,
      url: `${env.APP_URL}/interviews/${invitationId}?t=${token}`,
    });
  } catch (error) {
    console.error("sending the invitation email failed:", error);
    await undo(event.eventId);
    return fail("Could not send the email to the candidate. Try again.");
  }

  return {
    applicationId: request.applicationId,
    ok: true,
    interview: {
      id: invitationId,
      status: "pending",
      startsAt: startsAt.toISOString(),
      durationMinutes: request.durationMinutes,
      timeZone: request.timeZone,
      expiresAt: created.deadline,
      respondedAt: null,
      meetUrl: event.meetUrl,
    },
  };
}

// Several invitations, one after the other: they share a calendar and a limit.
export async function sendInterviewInvitations(userId: string, requests: readonly InterviewRequest[]): Promise<InviteOutcome[]> {
  const outcomes: InviteOutcome[] = [];
  for (const request of requests) outcomes.push(await sendInterviewInvitation(userId, request));
  return outcomes;
}
