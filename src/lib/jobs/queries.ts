import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { isValidSlug } from "@/lib/companies/company";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";
import { supabasePublic } from "@/lib/supabase/public";
import {
  listId,
  postingIdOf,
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

// What a list id may look like before it is looked up (getJobDescription). A scraped job's id is the
// scraper's text key, `<source>:<id from that source>`, and the id from the source is anything: 3,500 of
// the 6,300 active ones have a "/" or a space in them. So the check is only that it is one line of a
// sane length; a posted job's id (`callback:<uuid>`) is then checked as the uuid it must be.
const listIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\u0000-\u001f\u007f]+$/);

// Reads what a call of `published_job_postings` answers, or throws when the database fails, so the
// callers' caches never keep a list that is missing them.
async function readPublishedRows(
  answer: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<PublishedJobRow[]> {
  const { data, error } = await answer;
  if (error) throw new Error(`published_job_postings: ${error.message}`);
  return (data ?? []) as PublishedJobRow[];
}

// The jobs companies published on Callback, through the public function that answers what a
// candidate may see of them (supabase/migrations/20261109130000_published_jobs.sql): no CV filters.
// Pass an id for a single job, or a company's slug for the jobs of one company. With neither it is
// every published job, which is read a page at a time: the function's answer is cut at 1000 rows
// like any other, and the cut is silent. Throws when the database does.
async function fetchPublishedJobs(filter: { jobId?: string; companySlug?: string } = {}): Promise<PublishedJob[]> {
  const args: { p_job_id?: string; p_company_slug?: string } = {};
  if (filter.jobId) args.p_job_id = filter.jobId;
  if (filter.companySlug) args.p_company_slug = filter.companySlug;
  const rows =
    filter.jobId || filter.companySlug
      ? await readPublishedRows(supabasePublic.rpc("published_job_postings", args))
      : await fetchAllPages(
          (from, to) => readPublishedRows(supabasePublic.rpc("published_job_postings", args).range(from, to)),
          PAGE_SIZE,
        );
  return rows.map(toPublishedJob);
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

  const rows = await fetchAllPages<JobRow>(async (from, to) => {
    const { data, error } = await supabasePublic
      .from("jobs")
      .select(JOB_COLUMNS)
      .eq("active", true)
      .order("id")
      .range(from, to)
      .returns<JobRow[]>();
    if (error) throw new Error(`getActiveJobs: ${error.message}`);
    return data ?? [];
  }, PAGE_SIZE);
  const posted = await fetchPublishedJobs();
  return [...posted.map(toPostedListItem), ...rows.map(toListItem)];
}

// Every description at once, by list id. It is 28 MB of text, so only what filters on the description
// asks for it; the description sheet reads one job's (getJobDescription). Served by
// src/app/api/jobs/descriptions/route.ts.
export async function getJobDescriptions(): Promise<Record<string, string>> {
  "use cache";
  cacheLife("hours");
  cacheTag("jobs");

  const result: Record<string, string> = {};
  for (const job of await fetchPublishedJobs()) {
    if (job.description) result[listId(job.id)] = job.description;
  }
  const scraped = await fetchAllPages<{ id: string; description: string | null }>(async (from, to) => {
    const { data, error } = await supabasePublic
      .from("jobs")
      .select("id, description")
      .eq("active", true)
      .not("description", "is", null)
      .order("id")
      .range(from, to)
      .returns<{ id: string; description: string | null }[]>();
    if (error) throw new Error(`getJobDescriptions: ${error.message}`);
    return data ?? [];
  }, PAGE_SIZE);
  for (const row of scraped) {
    if (row.description) result[row.id] = row.description;
  }
  return result;
}

// One job's description, for the description sheet, by its list id; null when there is none: a job
// with no text, one that is no longer active or published, and an id nobody has all look the same.
// Served by src/app/api/jobs/descriptions/[jobId]/route.ts. Cached per job and expired by the same
// tag as the list. An id that can't be one is answered before the cache sees it, so a request can't
// fill the cache with ids of its own making (the same as getCompanyPublishedJobs does for slugs).
export async function getJobDescription(listItemId: string): Promise<string | null> {
  if (!listIdSchema.safeParse(listItemId).success) return null;
  const postingId = postingIdOf(listItemId);
  if (postingId !== null && !z.uuid().safeParse(postingId).success) return null;
  return readJobDescription(listItemId);
}

async function readJobDescription(listItemId: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("jobs");

  const postingId = postingIdOf(listItemId);
  if (postingId !== null) {
    return (await fetchPublishedJobs({ jobId: postingId }))[0]?.description || null;
  }
  const { data, error } = await supabasePublic
    .from("jobs")
    .select("description")
    .eq("id", listItemId)
    .eq("active", true)
    .maybeSingle<{ description: string | null }>();
  if (error) throw new Error(`getJobDescription: ${error.message}`);
  return data?.description || null;
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
