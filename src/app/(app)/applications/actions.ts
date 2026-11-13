"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { APPLICATION_STATUSES } from "@/lib/applications/types";
import { requireAccountType } from "@/lib/auth/dal";
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
