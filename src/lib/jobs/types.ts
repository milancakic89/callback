export const WORK_MODES = ["REMOTE", "HYBRID", "ON_SITE"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ON_SITE: "On-site",
};

// One row of the dashboard table. Mirrors a subset of `public.jobs` (see
// supabase/migrations/*_jobs.sql), mapped to camelCase. Deliberately excludes `description`,
// which loads separately — see features/dashboard.md.
export type JobListItem = {
  id: string;
  title: string;
  companyName: string;
  locationRaw: string | null;
  department: string | null;
  workMode: WorkMode | null;
  postedAt: string | null;
  firstSeenAt: string;
  url: string | null;
};

// `posted_at` is missing for most rows (see features/dashboard.md); fall back to when the
// scraper first saw the posting so sorting and the Posted filter always have a value.
export function jobDate(job: Pick<JobListItem, "postedAt" | "firstSeenAt">): string {
  return job.postedAt ?? job.firstSeenAt;
}
