"use server";

import { z } from "zod";
import { APPLICATION_STATUSES } from "@/lib/applications/types";
import { requireAccountType } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/rate-limit";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

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
