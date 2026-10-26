"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAccountType } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/rate-limit";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  jobId: z.uuid(),
});

export type DeleteJobPostingResult = { ok: true } | { ok: false; error: string };

// Called directly from the confirm dialog on a job card (src/components/employer/delete-job-button.tsx),
// not a form. Row level security only lets a company delete its own jobs, so another company's id
// deletes nothing and answers "Job not found". The job's applications go with it (on delete
// cascade); the candidates stay. See features/demo-job.md.
export async function deleteJobPosting(jobId: string): Promise<DeleteJobPostingResult> {
  const parsed = inputSchema.safeParse({ jobId });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("employer");

  const { success } = await rateLimit({
    key: `delete-job:${user.id}`,
    limit: 30,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const supabase = await createClient();

  const { data, error } = await supabase.from("job_postings").delete().eq("id", parsed.data.jobId).select("id");
  if (error) return { ok: false, error: "Could not delete. Try again." };
  if (!data?.length) return { ok: false, error: "Job not found." };

  // The dashboard is a Server Component: this re-renders it without the job.
  refresh();
  return { ok: true };
}
