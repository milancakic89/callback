import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CompanyJob = {
  id: string;
  title: string;
  isDemo: boolean;
  createdAt: string;
  applicantCount: number;
};

type JobRow = {
  id: string;
  title: string;
  is_demo: boolean;
  created_at: string;
  // An aggregate embed: PostgREST answers `[{ count: n }]`, and RLS only counts the company's own.
  job_applications: { count: number }[];
};

// Makes the signed-in employer's company if it has none and, once, its demo job with three
// applicants (supabase/migrations/20261026210000_employer_jobs.sql). Safe to call on every visit.
// A write, so it runs per request from the dashboard, never from a cached component.
export async function ensureEmployerWorkspace(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ensure_employer_workspace");
  if (error) throw new Error(`ensureEmployerWorkspace: ${error.message}`);
}

// Not cached: reads the session cookie. Row level security scopes both tables to the signed-in
// employer's company.
export async function getCompanyJobs(): Promise<CompanyJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_postings")
    .select("id, title, is_demo, created_at, job_applications(count)")
    .order("created_at", { ascending: false })
    .returns<JobRow[]>();
  if (error) throw new Error(`getCompanyJobs: ${error.message}`);

  return (data ?? []).map((job) => ({
    id: job.id,
    title: job.title,
    isDemo: job.is_demo,
    createdAt: job.created_at,
    applicantCount: job.job_applications[0]?.count ?? 0,
  }));
}
