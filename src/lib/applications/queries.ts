import "server-only";
import { isExternalSource } from "@/lib/external-jobs/sources";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus, ExternalApplicationItem, ManualApplicationItem } from "./types";

type ApplicationRow = {
  job_id: string;
  status: ApplicationStatus;
  applied_at: string;
  job: { title: string; company_name: string; url: string | null; active: boolean } | null;
};

// Not cached: reads the session cookie, so it must stay fresh per user. RLS already scopes this
// to the signed-in user; the explicit `.eq` is belt-and-braces. The join only returns an inactive
// job because of the "Users can read jobs they applied to" policy on `jobs`.
export async function getApplications(userId: string): Promise<ManualApplicationItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("job_id, status, applied_at, job:jobs(title, company_name, url, active)")
    .eq("user_id", userId)
    .returns<ApplicationRow[]>();
  if (error) throw new Error(`getApplications: ${error.message}`);

  return (data ?? []).map((row) => ({
    kind: "manual" as const,
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

type ExternalApplicationRow = {
  id: string;
  source: string;
  url: string;
  title: string;
  company_name: string;
  location: string | null;
  cv_id: string | null;
  status: ApplicationStatus;
  applied_at: string;
};

// The jobs the candidate added from LinkedIn, HelloWorld or Infostud with the browser extension
// (features/chrome-extension.md), as rows of /applications. RLS scopes the read to the caller; the
// explicit `.eq` is belt-and-braces. `cvFileName` is left empty: the table of CVs has no client select,
// so the page names each CV from the candidate's own list (withCvFileNames). Not cached: per user.
export async function getExternalApplications(userId: string): Promise<ExternalApplicationItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("external_applications")
    .select("id, source, url, title, company_name, location, cv_id, status, applied_at")
    .eq("user_id", userId)
    .returns<ExternalApplicationRow[]>();
  if (error) throw new Error(`getExternalApplications: ${error.message}`);

  return (data ?? []).flatMap((row): ExternalApplicationItem[] => {
    // The table's check constraint allows no other source; a row that breaks it is left out, not guessed at.
    if (!isExternalSource(row.source)) return [];
    return [
      {
        kind: "external",
        id: row.id,
        source: row.source,
        status: row.status,
        appliedAt: row.applied_at,
        title: row.title,
        companyName: row.company_name,
        location: row.location,
        url: row.url,
        cvId: row.cv_id,
        cvFileName: null,
      },
    ];
  });
}

// The candidate's row for one job address, or null: the page that adds a job says "Already in your
// applications" instead of offering the form (unique (user_id, url) would refuse it anyway).
export type TrackedExternalApplication = { id: string; status: ApplicationStatus; title: string; companyName: string };

export async function findExternalApplication(userId: string, url: string): Promise<TrackedExternalApplication | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("external_applications")
    .select("id, status, title, company_name")
    .eq("user_id", userId)
    .eq("url", url)
    .maybeSingle<{ id: string; status: ApplicationStatus; title: string; company_name: string }>();
  if (error) throw new Error(`findExternalApplication: ${error.message}`);
  return data ? { id: data.id, status: data.status, title: data.title, companyName: data.company_name } : null;
}
