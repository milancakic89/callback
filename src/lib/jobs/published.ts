// Jobs that companies posted on Callback (features/apply-with-cv.md), as the job board and a
// posting's page see them. Plain module, no `server-only`: the pure parts are tested, and the job
// table builds a posting's link from a list id.
import { NATIVE_SOURCE, type JobListItem, type WorkMode } from "./types";

// What public.published_job_postings() answers. It has no CV filters, no demo flag and no counts, and
// nothing else is ever read from a row: candidates must not learn what the company screens for
// (features/job-filters.md).
export type PublishedJobRow = {
  id: string;
  title: string;
  description: string;
  location_raw: string | null;
  work_mode: WorkMode | null;
  published_at: string;
  company_name: string;
  company_slug: string;
};

export type PublishedJob = {
  // The job_postings id, a uuid. The board's list id is `callback:<id>` (listId()).
  id: string;
  title: string;
  description: string;
  locationRaw: string | null;
  workMode: WorkMode | null;
  publishedAt: string;
  companyName: string;
  companySlug: string;
};

// Field by field, so a column the function one day returns by mistake can't reach a page.
export function toPublishedJob(row: PublishedJobRow): PublishedJob {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    locationRaw: row.location_raw,
    workMode: row.work_mode,
    publishedAt: row.published_at,
    companyName: row.company_name,
    companySlug: row.company_slug,
  };
}

const LIST_ID_PREFIX = `${NATIVE_SOURCE}:`;

// The id a job has in the job table. `jobs.id` of a scraped job is a text key; a Callback job's
// carries its source in front, so the two can never clash and the table can tell them apart.
export function listId(jobId: string): string {
  return `${LIST_ID_PREFIX}${jobId}`;
}

// The job_postings id behind a list id, or null for a scraped job's.
export function postingIdOf(listItemId: string): string | null {
  return listItemId.startsWith(LIST_ID_PREFIX) ? listItemId.slice(LIST_ID_PREFIX.length) : null;
}

// A posting's own page.
export function postingPath(jobId: string): string {
  return `/jobs/${jobId}`;
}

// The posting with its apply dialog open (features/candidate-cvs.md): where signing in or signing up
// to apply comes back to. postingNext() in src/lib/auth/safe-next.ts accepts exactly this shape.
export function applyPath(jobId: string): string {
  return `${postingPath(jobId)}?apply=1`;
}

// A row of the job table. A posted job is listed from the day it was published and is always open
// (an unpublished one isn't returned at all). It has no `url`: its page is on Callback.
export function toListItem(job: PublishedJob): JobListItem {
  return {
    id: listId(job.id),
    title: job.title,
    companyName: job.companyName,
    locationRaw: job.locationRaw,
    department: null,
    workMode: job.workMode,
    postedAt: job.publishedAt,
    firstSeenAt: job.publishedAt,
    url: null,
    source: NATIVE_SOURCE,
    active: true,
  };
}
