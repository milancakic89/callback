"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/rate-limit";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  jobId: z.string().min(1).max(300),
  applied: z.boolean(),
});

export type SetAppliedResult = { ok: true } | { ok: false; error: string };

// Called directly from the Applied checkbox (src/components/jobs/applied-checkbox.tsx), not a
// form — see features/dashboard.md "Applied Server Action".
export async function setApplied(jobId: string, applied: boolean): Promise<SetAppliedResult> {
  const parsed = inputSchema.safeParse({ jobId, applied });
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

  if (parsed.data.applied) {
    const { error } = await supabase
      .from("applications")
      .upsert({ user_id: user.id, job_id: parsed.data.jobId }, { onConflict: "user_id,job_id", ignoreDuplicates: true });
    if (error) return { ok: false, error: "Could not save. Try again." };
  } else {
    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("user_id", user.id)
      .eq("job_id", parsed.data.jobId);
    if (error) return { ok: false, error: "Could not save. Try again." };
  }

  return { ok: true };
}
