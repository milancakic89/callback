import { sortJobs } from "./filter";
import type { JobListItem } from "./types";

// Rows per page of the job table until the visitor picks another size.
export const DEFAULT_PAGE_SIZE = 20;

// What the job pages (/jobs, /dashboard) send in the HTML instead of the whole list: the first page
// of the table as it opens (unfiltered, Posted newest first) and how many jobs there are in all. The
// explorer shows these at once and loads the rest from /api/jobs/list. Sending all 6,000 jobs to
// every visitor in the page itself made each request serialize and compress 6.5 MB
// (features/performance.md).
export type JobsPreview = {
  previewRows: JobListItem[];
  totalCount: number;
};

export function previewOf(jobs: JobListItem[]): JobsPreview {
  return { previewRows: sortJobs(jobs, "posted", "desc").slice(0, DEFAULT_PAGE_SIZE), totalCount: jobs.length };
}
