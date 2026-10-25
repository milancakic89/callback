"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/rate-limit";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  jobId: z.string().min(1).max(300),
});

const savedSchema = z.object({
  jobId: z.string().min(1).max(300),
  saved: z.boolean(),
});

export type MarkAppliedResult = { ok: true } | { ok: false; error: string };
export type SetSavedResult = { ok: true } | { ok: false; error: string };

// Called directly from the dashboard's confirm dialog (src/components/jobs/jobs-explorer.tsx),
// not a form. There is deliberately no "unapply": applying is one-way, and the database has no
// delete policy either — see features/applied.md.
export async function markApplied(jobId: string): Promise<MarkAppliedResult> {
  const parsed = inputSchema.safeParse({ jobId });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireUser();

  const { success } = await rateLimit({
    key: `applied:${user.id}`,
    limit: 60,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const supabase = await createClient();

  // `ignoreDuplicates` keeps a repeat request a no-op, so it can't reset an existing status.
  const { error } = await supabase
    .from("applications")
    .upsert({ user_id: user.id, job_id: parsed.data.jobId }, { onConflict: "user_id,job_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Could not save. Try again." };

  return { ok: true };
}

// Called from the heart in the jobs table (src/components/jobs/jobs-explorer.tsx), on /dashboard
// and /saved-jobs. Unlike applying, saving toggles both ways — see features/saved-jobs.md.
export async function setSaved(jobId: string, saved: boolean): Promise<SetSavedResult> {
  const parsed = savedSchema.safeParse({ jobId, saved });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireUser();

  const { success } = await rateLimit({
    key: `saved:${user.id}`,
    limit: 60,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const supabase = await createClient();

  const { error } = parsed.data.saved
    ? await supabase
        .from("saved_jobs")
        .upsert({ user_id: user.id, job_id: parsed.data.jobId }, { onConflict: "user_id,job_id", ignoreDuplicates: true })
    : await supabase.from("saved_jobs").delete().eq("user_id", user.id).eq("job_id", parsed.data.jobId);
  if (error) return { ok: false, error: "Could not save. Try again." };

  return { ok: true };
}
