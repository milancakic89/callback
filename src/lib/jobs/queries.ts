import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabasePublic } from "@/lib/supabase/public";
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

// The dashboard table's data, without `description` (loaded separately — see
// features/dashboard.md "Description loading"). `supabasePublic` has no cookies, so this can be
// cached: RLS limits it to active jobs either way.
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
  return rows.map(toListItem);
}

// Served by src/app/api/jobs/descriptions/route.ts, fetched client-side after the table renders.
export async function getJobDescriptions(): Promise<Record<string, string>> {
  "use cache";
  cacheLife("hours");
  cacheTag("jobs");

  const result: Record<string, string> = {};
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
