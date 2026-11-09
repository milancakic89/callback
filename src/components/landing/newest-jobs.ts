import { isNativeJob, jobDate, type JobListItem } from "@/lib/jobs/types";

// The postings the landing page previews: jobs posted on Callback first, as on the job board, then
// the newest, at most one per company, since a single employer often publishes a batch at once,
// which would otherwise fill the whole preview. Returns a new array; the list is left as it is.
export function newestPerCompany(jobs: JobListItem[], count: number): JobListItem[] {
  const ordered = [...jobs].sort(
    (a, b) => Number(isNativeJob(b)) - Number(isNativeJob(a)) || Date.parse(jobDate(b)) - Date.parse(jobDate(a)),
  );
  const seen = new Set<string>();
  const picked: JobListItem[] = [];
  for (const job of ordered) {
    if (picked.length >= count) break;
    const company = job.companyName.trim().toLowerCase();
    if (seen.has(company)) continue;
    seen.add(company);
    picked.push(job);
  }
  return picked;
}
