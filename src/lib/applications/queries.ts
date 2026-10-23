import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationListItem, ApplicationStatus } from "./types";

type ApplicationRow = {
  job_id: string;
  status: ApplicationStatus;
  applied_at: string;
  job: { title: string; company_name: string; url: string | null; active: boolean } | null;
};

// Not cached: reads the session cookie, so it must stay fresh per user. RLS already scopes this
// to the signed-in user; the explicit `.eq` is belt-and-braces. The join only returns an inactive
// job because of the "Users can read jobs they applied to" policy on `jobs`.
export async function getApplications(userId: string): Promise<ApplicationListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("job_id, status, applied_at, job:jobs(title, company_name, url, active)")
    .eq("user_id", userId)
    .returns<ApplicationRow[]>();
  if (error) throw new Error(`getApplications: ${error.message}`);

  return (data ?? []).map((row) => ({
    jobId: row.job_id,
    status: row.status,
    appliedAt: row.applied_at,
    // Shouldn't happen with the policy above in place; the row is still listed rather than dropped.
    title: row.job?.title ?? "Job no longer available",
    companyName: row.job?.company_name ?? "—",
    url: row.job?.url ?? null,
    active: row.job?.active ?? false,
  }));
}
