"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { CV_GONE_MESSAGE } from "@/lib/applications/apply-schema";
import { APPLICATION_STATUSES } from "@/lib/applications/types";
import { requireAccountType } from "@/lib/auth/dal";
import { ALREADY_ADDED_MESSAGE, addExternalApplicationSchema, LIMIT_MESSAGE } from "@/lib/external-jobs/add-schema";
import { INVALID_JOB_LINK_MESSAGE } from "@/lib/external-jobs/track-query";
import { answerInvitation } from "@/lib/interviews/respond";
import { rateLimit } from "@/lib/rate-limit";
import { drainStorageDeletions } from "@/lib/storage/deletions";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

export type WithdrawApplicationResult = { ok: true } | { ok: false; error: string };

// "Withdraw" on an application to a job posted on Callback (features/candidate-cvs.md). The function
// only touches the caller's own active application, and in the same update gives up its documents:
// the company loses access, the CV is unlocked, and the cover letter is queued for deletion, which
// runs after the response. Withdrawing can't be undone, and the job can't be applied to again.
export async function withdrawMyApplication(applicationId: string): Promise<WithdrawApplicationResult> {
  const parsed = z.uuid().safeParse(applicationId);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("candidate");

  const { success } = await rateLimit({
    key: `withdraw:${user.id}`,
    limit: 20,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("withdraw_my_application", { p_application_id: parsed.data });
  if (error) {
    console.error("withdrawMyApplication failed:", error.code, error.message);
    return { ok: false, error: "Could not withdraw. Try again." };
  }
  if (data !== true) return { ok: false, error: "This application is already withdrawn." };

  after(drainStorageDeletions);
  refresh();
  return { ok: true };
}

const inputSchema = z.object({
  jobId: z.string().min(1).max(300),
  status: z.enum(APPLICATION_STATUSES),
});

export type SetApplicationStatusResult = { ok: true } | { ok: false; error: string };

// Called directly from the status dropdown on /applications, not a form. Status is the only
// column a user may update (column-level grant) — see features/applied.md.
export async function setApplicationStatus(jobId: string, status: string): Promise<SetApplicationStatusResult> {
  const parsed = inputSchema.safeParse({ jobId, status });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("candidate");

  const { success } = await rateLimit({
    key: `application-status:${user.id}`,
    limit: 60,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .update({ status: parsed.data.status })
    .eq("user_id", user.id)
    .eq("job_id", parsed.data.jobId)
    .select("job_id");
  if (error) return { ok: false, error: "Could not save. Try again." };
  // Zero rows: the user never applied to that job (or RLS hid it).
  if (!data || data.length === 0) return { ok: false, error: "Application not found." };

  return { ok: true };
}

export type RespondToInterviewResult = { ok: true; response: "confirmed" | "declined" } | { ok: false; error: string };

// Confirm or Decline on a signed-in candidate's own application (features/interview-invitations.md): the
// same answer as the email's page, for a candidate who is already here. Who they are comes from the
// session, and only the application's own candidate can answer.
export async function respondToMyInterview(invitationId: string, response: "confirm" | "decline"): Promise<RespondToInterviewResult> {
  const parsed = z.object({ invitationId: z.uuid(), response: z.enum(["confirm", "decline"]) }).safeParse({ invitationId, response });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("candidate");

  const { success } = await rateLimit({
    key: `interview-respond:user:${user.id}`,
    limit: 20,
    windowMs: 15 * 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many attempts. Try again in a few minutes." };

  try {
    const result = await answerInvitation(parsed.data.invitationId, parsed.data.response, { kind: "candidate", userId: user.id });
    if (result.ok) {
      refresh();
      return { ok: true, response: result.response };
    }
    if (result.reason === "closed") {
      // Already answered, expired or cancelled: show them how it stands now.
      refresh();
      return { ok: false, error: "This invitation has already closed." };
    }
    return { ok: false, error: "This invitation isn't available." };
  } catch (error) {
    console.error("respondToMyInterview failed:", error);
    return { ok: false, error: "Could not save your answer. Try again." };
  }
}

export type AddExternalApplicationState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const HOUR = 60 * 60_000;

// What the database says when a row is refused, as the candidate should hear it: the same job twice
// (unique (user_id, url)), a CV that isn't theirs or is gone (the foreign key), the 1,000-row limit
// (the trigger), and a check constraint, which only a form that skipped the schema could trip.
function insertErrorMessage(code: string | undefined): string {
  switch (code) {
    case "23505":
      return ALREADY_ADDED_MESSAGE;
    case "23503":
      return CV_GONE_MESSAGE;
    case "54000":
      return LIMIT_MESSAGE;
    case "23514":
      return INVALID_JOB_LINK_MESSAGE;
    default:
      return "Could not save. Try again.";
  }
}

// "Save" on /applications/new (features/chrome-extension.md), through useActionState. The only thing
// that writes a row: opening the page, which the browser extension's link does, never does. The job's
// address, title, company and the rest are untrusted form fields, checked again by
// addExternalApplicationSchema (the address reduced to its canonical form, the source taken from its
// host), and the owner is the session's, never a field: the row is inserted with the candidate's own
// client, so RLS and the table's constraints apply. In this order:
//   1. the fields are valid;
//   2. the caller is a candidate, within 30 jobs an hour;
//   3. the insert, whose failures are told in insertErrorMessage();
//   4. on success the candidate is sent to /applications, where the row is.
export async function addExternalApplication(
  _previous: AddExternalApplicationState,
  formData: FormData,
): Promise<AddExternalApplicationState> {
  const parsed = addExternalApplicationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    // The address isn't a field the candidate can fix on this page.
    if (fieldErrors.url) return { error: INVALID_JOB_LINK_MESSAGE };
    return { fieldErrors };
  }
  const { url, title, company, location, cvId, status } = parsed.data;

  const user = await requireAccountType("candidate");

  const { success } = await rateLimit({
    key: `external-application:${user.id}`,
    limit: 30,
    windowMs: HOUR,
    store: postgresStore,
  });
  if (!success) return { error: "Too many jobs added. Try again in an hour." };

  const supabase = await createClient();
  const { error } = await supabase.from("external_applications").insert({
    source: url.source,
    url: url.url,
    title,
    company_name: company,
    location,
    cv_id: cvId,
    status,
  });
  if (error) {
    if (error.code !== "23505" && error.code !== "23503" && error.code !== "54000") {
      console.error("addExternalApplication failed:", error.code, error.message);
    }
    return { error: insertErrorMessage(error.code) };
  }

  redirect("/applications");
}

export type SetExternalApplicationStatusResult = { ok: true } | { ok: false; error: string };

const externalStatusSchema = z.object({ id: z.uuid(), status: z.enum(APPLICATION_STATUSES) });

// The status dropdown of a job added from another site, called directly like setApplicationStatus.
// Status is the only column a client may update (supabase/migrations/*_external_applications.sql).
export async function setExternalApplicationStatus(id: string, status: string): Promise<SetExternalApplicationStatusResult> {
  const parsed = externalStatusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("candidate");

  const { success } = await rateLimit({
    key: `external-application-status:${user.id}`,
    limit: 60,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("external_applications")
    .update({ status: parsed.data.status })
    .eq("user_id", user.id)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return { ok: false, error: "Could not save. Try again." };
  // Zero rows: not the caller's (or already removed).
  if (!data || data.length === 0) return { ok: false, error: "Application not found." };

  return { ok: true };
}

export type RemoveExternalApplicationResult = { ok: true } | { ok: false; error: string };

// "Remove" on a job added from another site, after its confirmation. Only these rows can be removed:
// applying through Callback is one-way (features/applied.md), and the jobs tracked by hand stay.
export async function removeExternalApplication(id: string): Promise<RemoveExternalApplicationResult> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("candidate");

  const { success } = await rateLimit({
    key: `external-application-remove:${user.id}`,
    limit: 20,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("external_applications")
    .delete()
    .eq("user_id", user.id)
    .eq("id", parsed.data)
    .select("id");
  if (error) return { ok: false, error: "Could not remove. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "Application not found." };

  refresh();
  return { ok: true };
}
