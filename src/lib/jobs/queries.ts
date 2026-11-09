import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { isValidSlug } from "@/lib/companies/company";
import { createClient } from "@/lib/supabase/server";
import { supabasePublic } from "@/lib/supabase/public";
import {
  listId,
  toListItem as toPostedListItem,
  toPublishedJob,
  type PublishedJob,
  type PublishedJobRow,
} from "./published";
import type { JobListItem, WorkMode } from "./types";

// Supabase caps a single response at 1000 rows by default; there are already 1283+ active jobs.
const PAGE_SIZE = 1000;

type JobRow = {
  id: string;
  title: string;
  company_name: string;
  location_raw: string | null;
  department: string | null;
  work_mode: WorkMode | null;
  posted_at: string | null;
  first_seen_at: string;
  url: string | null;
  source: string;
  active: boolean;
};

const JOB_COLUMNS =
  "id, title, company_name, location_raw, department, work_mode, posted_at, first_seen_at, url, source, active";

function toListItem(row: JobRow): JobListItem {
  return {
    id: row.id,
    title: row.title,
    companyName: row.company_name,
    locationRaw: row.location_raw,
    department: row.department,
    workMode: row.work_mode,
    postedAt: row.posted_at,
    firstSeenAt: row.first_seen_at,
    url: row.url,
    source: row.source,
    active: row.active,
  };
}

// The jobs companies published on Callback, through the public function that answers what a
// candidate may see of them (supabase/migrations/20261109130000_published_jobs.sql): no CV filters.
// Pass an id for a single job, or a company's slug for the jobs of one company. Throws when the
// database does, so the callers' caches never keep a list that is missing them.
async function fetchPublishedJobs(filter: { jobId?: string; companySlug?: string } = {}): Promise<PublishedJob[]> {
  const args: { p_job_id?: string; p_company_slug?: string } = {};
  if (filter.jobId) args.p_job_id = filter.jobId;
  if (filter.companySlug) args.p_company_slug = filter.companySlug;
  const { data, error } = await supabasePublic.rpc("published_job_postings", args);
  if (error) throw new Error(`published_job_postings: ${error.message}`);
  return ((data ?? []) as PublishedJobRow[]).map(toPublishedJob);
}

// The dashboard table's data, without `description` (loaded separately — see
// features/dashboard.md "Description loading"). `supabasePublic` has no cookies, so this can be
// cached: RLS limits it to active jobs either way. The jobs posted on Callback come with the scraped
// ones (features/apply-with-cv.md); the table lists them first. The `jobs` tag is expired when a
// company publishes, unpublishes or edits a posted job (src/app/(employer)/[company]/actions.ts), as
// well as by the scraper.
export async function getActiveJobs(): Promise<JobListItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("jobs");

  const rows: JobRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabasePublic
      .from("jobs")
      .select(JOB_COLUMNS)
      .eq("active", true)
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
      .returns<JobRow[]>();
    if (error) throw new Error(`getActiveJobs: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  const posted = await fetchPublishedJobs();
  return [...posted.map(toPostedListItem), ...rows.map(toListItem)];
}

// Served by src/app/api/jobs/descriptions/route.ts, fetched client-side after the table renders.
export async function getJobDescriptions(): Promise<Record<string, string>> {
  "use cache";
  cacheLife("hours");
  cacheTag("jobs");

  const result: Record<string, string> = {};
  for (const job of await fetchPublishedJobs()) {
    if (job.description) result[listId(job.id)] = job.description;
  }
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabasePublic
      .from("jobs")
      .select("id, description")
      .eq("active", true)
      .not("description", "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
      .returns<{ id: string; description: string | null }[]>();
    if (error) throw new Error(`getJobDescriptions: ${error.message}`);
    for (const row of data ?? []) {
      if (row.description) result[row.id] = row.description;
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return result;
}

// One published job for its page, /jobs/{id} (features/apply-with-cv.md), or null when there is
// none: an unpublished job, the demo job and an unknown id all look the same. Cached like the list
// and expired by the same tag, so unpublishing takes the page down on the next visit.
export async function getPublishedJob(jobId: string): Promise<PublishedJob | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("jobs");

  if (!z.uuid().safeParse(jobId).success) return null;
  return (await fetchPublishedJobs({ jobId }))[0] ?? null;
}

// The open positions of one company, newest first, for its page /companies/{slug}
// (features/company-profile.md). Cached under the same tag as the list, so publishing, unpublishing
// or editing a job refreshes it. A slug that can't be a company's is answered with no jobs before the
// cache sees it.
export async function getCompanyPublishedJobs(companySlug: string): Promise<PublishedJob[]> {
  if (!isValidSlug(companySlug)) return [];
  return readCompanyPublishedJobs(companySlug);
}

async function readCompanyPublishedJobs(companySlug: string): Promise<PublishedJob[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("jobs");

  return fetchPublishedJobs({ companySlug });
}

// When the signed-in candidate applied to a posted job, or null. Not cached: it is per user. The
// function answers only about the caller (supabase/migrations/20261109130000_published_jobs.sql),
// so the explicit job id is all there is to ask.
export async function getMyApplicationDate(jobId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_job_application", { p_job_id: jobId });
  if (error) throw new Error(`getMyApplicationDate: ${error.message}`);
  return typeof data === "string" ? data : null;
}

// What the apply form fills in for a candidate who has applied before: their own profile
// (name and location), which row level security shows only to them. Not cached: per user.
export async function getMyCandidateProfile(userId: string): Promise<{ fullName: string; location: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidate_profiles")
    .select("full_name, location")
    .eq("user_id", userId)
    .maybeSingle<{ full_name: string; location: string | null }>();
  if (error) throw new Error(`getMyCandidateProfile: ${error.message}`);
  return data ? { fullName: data.full_name, location: data.location } : null;
}

// Not cached: reads the session cookie, so it must stay fresh per user. RLS already scopes this
// to the signed-in user; the explicit `.eq` is belt-and-braces.
export async function getAppliedJobIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("job_id")
    .eq("user_id", userId)
    .returns<{ job_id: string }[]>();
  if (error) throw new Error(`getAppliedJobIds: ${error.message}`);
  return (data ?? []).map((row) => row.job_id);
}

// Same shape as getAppliedJobIds, for the dashboard's Save job hearts.
export async function getSavedJobIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_jobs")
    .select("job_id")
    .eq("user_id", userId)
    .returns<{ job_id: string }[]>();
  if (error) throw new Error(`getSavedJobIds: ${error.message}`);
  return (data ?? []).map((row) => row.job_id);
}

// The /saved-jobs table's data. Not cached (session cookie), and not getActiveJobs() filtered by
// saved IDs: a saved job the scraper has since taken down must stay listed, which only the
// "Users can read jobs they saved" policy on `jobs` allows for this client.
export async function getSavedJobs(userId: string): Promise<JobListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_jobs")
    .select(`job:jobs(${JOB_COLUMNS})`)
    .eq("user_id", userId)
    .returns<{ job: JobRow | null }[]>();
  if (error) throw new Error(`getSavedJobs: ${error.message}`);
  return (data ?? []).flatMap((row) => (row.job ? [toListItem(row.job)] : []));
}
