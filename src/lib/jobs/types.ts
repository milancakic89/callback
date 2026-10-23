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
  // Where the posting came from: an ATS, a job board, or the scraper's generic page extraction.
  // Shown in the Source column — the job boards' terms require crediting them.
  source: string;
};

const SOURCE_LABELS: Record<string, string> = {
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  remoteok: "Remote OK",
  remotive: "Remotive",
  arbeitnow: "Arbeitnow",
  joberty: "Joberty",
  smartrecruiters: "SmartRecruiters",
  bamboohr: "BambooHR",
  talentlyft: "TalentLyft",
  hibob: "HiBob",
  jazzhr: "JazzHR",
  icims: "iCIMS",
  successfactors: "SuccessFactors",
  // The scraper read these off the company's own careers page, with no ATS behind it.
  dom: "Company site",
  network: "Company site",
  jsonld: "Company site",
};

// Every other ATS name is a single word ("greenhouse" → "Greenhouse").
export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

// `posted_at` is missing for most rows (see features/dashboard.md); fall back to when the
// scraper first saw the posting so sorting and the Posted filter always have a value.
export function jobDate(job: Pick<JobListItem, "postedAt" | "firstSeenAt">): string {
  return job.postedAt ?? job.firstSeenAt;
}
