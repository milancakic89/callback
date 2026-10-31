import "server-only";
import { z } from "zod";
import { MOCK_CANDIDATES } from "@/lib/candidates/mock-candidates";
import type { WorkMode } from "@/lib/jobs/types";
import { createClient } from "@/lib/supabase/server";

export type CompanyJob = {
  id: string;
  title: string;
  isDemo: boolean;
  // Null for a draft, which is how every job starts (features/job-publishing.md).
  publishedAt: string | null;
  createdAt: string;
  // The applications that haven't been withdrawn, and the ones that have.
  applicantCount: number;
  withdrawnCount: number;
};

type JobRow = {
  id: string;
  title: string;
  is_demo: boolean;
  published_at: string | null;
  created_at: string;
  // Aggregate embeds: PostgREST answers `[{ count: n }]`, and RLS only counts the company's own.
  active: { count: number }[];
  withdrawn: { count: number }[];
};

// What the edit form needs of one job.
export type CompanyJobDetails = {
  id: string;
  title: string;
  description: string;
  location: string;
  workMode: WorkMode | null;
  // The CV filters, private to the company (features/job-filters.md).
  requiredFilters: string[];
  optionalFilters: string[];
  isDemo: boolean;
};

type JobDetailsRow = {
  id: string;
  title: string;
  description: string;
  location_raw: string | null;
  work_mode: WorkMode | null;
  required_filters: string[];
  optional_filters: string[];
  is_demo: boolean;
};

// One active application to a job, as the review screen shows it (features/applicant-review.md).
// The documents are only named here: the files are opened through the document route, and their
// paths in the bucket never reach the browser.
export type JobApplicant = {
  id: string;
  name: string;
  location: string | null;
  appliedAt: string;
  viewed: boolean;
  liked: boolean;
  // The job's filters the CV meets; null until the application has been checked.
  matchedFilters: string[] | null;
  // The file names to show, or null when the application has no such document.
  cvFileName: string | null;
  coverLetterFileName: string | null;
};

type ApplicantRow = {
  id: string;
  applied_at: string;
  viewed_at: string | null;
  liked_at: string | null;
  matched_filters: string[] | null;
  cv_path: string | null;
  cover_letter_path: string | null;
  candidate: { full_name: string; location: string | null; sample_key: string | null } | null;
};

// A mock candidate's documents carry the file names the landing demo shows; a real one's are named by
// the last part of their path.
function fileName(path: string | null, sampleKey: string | null, kind: "cvFile" | "letterFile"): string | null {
  if (!path) return null;
  const mock = MOCK_CANDIDATES.find((candidate) => candidate.key === sampleKey);
  return mock ? mock[kind] : (path.split("/").at(-1) ?? path);
}

// Makes the signed-in employer's company if it has none and, once, its demo job with three
// applicants (supabase/migrations/20261026210000_employer_jobs.sql). Safe to call on every visit.
// A write, so it runs per request from the dashboard, never from a cached component. Returns the
// company's id, which publishing a job needs (features/post-job.md).
export async function ensureEmployerWorkspace(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_employer_workspace");
  if (error) throw new Error(`ensureEmployerWorkspace: ${error.message}`);
  if (typeof data !== "string") throw new Error("ensureEmployerWorkspace: no company id returned");
  return data;
}

// Not cached: reads the session cookie. Row level security scopes both tables to the signed-in
// employer's company. `active` and `withdrawn` are the same relationship embedded twice; the filters
// on `<alias>.withdrawn_at` narrow each embed, not the jobs.
export async function getCompanyJobs(): Promise<CompanyJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_postings")
    .select("id, title, is_demo, published_at, created_at, active:job_applications(count), withdrawn:job_applications(count)")
    .is("active.withdrawn_at", null)
    .not("withdrawn.withdrawn_at", "is", null)
    .order("created_at", { ascending: false })
    .returns<JobRow[]>();
  if (error) throw new Error(`getCompanyJobs: ${error.message}`);

  return (data ?? []).map((job) => ({
    id: job.id,
    title: job.title,
    isDemo: job.is_demo,
    publishedAt: job.published_at,
    createdAt: job.created_at,
    applicantCount: job.active[0]?.count ?? 0,
    withdrawnCount: job.withdrawn[0]?.count ?? 0,
  }));
}

// One job of the signed-in employer's company, for the edit form; null when there is none with that
// id (another company's included: row level security hides it). An id that isn't a uuid answers null
// without asking the database, which would answer with an error.
export async function getCompanyJob(jobId: string): Promise<CompanyJobDetails | null> {
  if (!z.uuid().safeParse(jobId).success) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_postings")
    .select("id, title, description, location_raw, work_mode, required_filters, optional_filters, is_demo")
    .eq("id", jobId)
    .maybeSingle<JobDetailsRow>();
  if (error) throw new Error(`getCompanyJob: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    location: data.location_raw ?? "",
    workMode: data.work_mode,
    requiredFilters: data.required_filters,
    optionalFilters: data.optional_filters,
    isDemo: data.is_demo,
  };
}

// The active (not withdrawn) applications to one of the company's jobs, first come first, for the
// review screen. Row level security answers only the company's own applications and the profiles of
// its applicants, so another company's job id gives an empty list. Applications made in the same
// instant (the demo job's three) are ordered by name, so the list is the same on every visit.
export async function getJobApplicants(jobId: string): Promise<JobApplicant[]> {
  if (!z.uuid().safeParse(jobId).success) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_applications")
    .select(
      "id, applied_at, viewed_at, liked_at, matched_filters, cv_path, cover_letter_path, candidate:candidate_profiles(full_name, location, sample_key)",
    )
    .eq("job_posting_id", jobId)
    .is("withdrawn_at", null)
    .order("applied_at", { ascending: true })
    .returns<ApplicantRow[]>();
  if (error) throw new Error(`getJobApplicants: ${error.message}`);

  return (data ?? [])
    .map((row) => {
      const sampleKey = row.candidate?.sample_key ?? null;
      return {
        id: row.id,
        name: row.candidate?.full_name ?? "Unknown candidate",
        location: row.candidate?.location ?? null,
        appliedAt: row.applied_at,
        viewed: row.viewed_at !== null,
        liked: row.liked_at !== null,
        matchedFilters: row.matched_filters,
        cvFileName: fileName(row.cv_path, sampleKey, "cvFile"),
        coverLetterFileName: fileName(row.cover_letter_path, sampleKey, "letterFile"),
      };
    })
    .sort((a, b) => a.appliedAt.localeCompare(b.appliedAt) || a.name.localeCompare(b.name));
}
