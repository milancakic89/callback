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
  // False once the scraper has taken the posting down. Only /saved-jobs can list such a job — see
  // features/saved-jobs.md; the dashboard's rows are always active.
  active: boolean;
};

// The `source` of a job posted on Callback itself (features/companies.md), as opposed to one the
// scraper found elsewhere.
export const NATIVE_SOURCE = "callback";

// A native job's application can be tracked and its status updated automatically, so the table lists
// it first and highlights it. Scraped jobs are tracked by hand by the candidate.
export function isNativeJob(job: Pick<JobListItem, "source">): boolean {
  return job.source === NATIVE_SOURCE;
}

const SOURCE_LABELS: Record<string, string> = {
  callback: "Callback",
  // A company's own ATS board, found through its job-board postings (scraper/stages/discover.ts).
  companyboards: "Company careers",
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  remoteok: "Remote OK",
  remotive: "Remotive",
  arbeitnow: "Arbeitnow",
  weworkremotely: "We Work Remotely",
  workingnomads: "Working Nomads",
  fourdayweek: "4 Day Week",
  jobspresso: "Jobspresso",
  cryptocurrencyjobs: "Cryptocurrency Jobs",
  remotefirstjobs: "Remote First Jobs",
  nodesk: "NoDesk",
  pythonorg: "Python.org",
  hackernews: "Hacker News",
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

// `posted_at` is the date the posting's own source gives (an ATS, the job's page, a job board). It
// is missing only where the source has none, so then fall back to when the scraper first saw the
// posting, and sorting and the Posted filter always have a value.
export function jobDate(job: Pick<JobListItem, "postedAt" | "firstSeenAt">): string {
  return job.postedAt ?? job.firstSeenAt;
}
