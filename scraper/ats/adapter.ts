import type { AtsName, RawJob } from "../types";

export type AtsProbe = {
  // Company name the ATS reports for this board, when it has one.
  name: string | null;
  // A little posting text, used to confirm boards whose API has no company name.
  sampleText: string;
  jobCount: number | null;
};

// What one call to a job's own detail gives that the job list doesn't. `postedAt` is an ISO
// timestamp (extract/posted-at.ts), or null when the detail has no date.
export type JobDetails = { description: string | null; postedAt: string | null };

export type AtsAdapter = {
  name: AtsName;
  boardUrl(slug: string): string;
  // Cheap existence check for slug guessing; null when the board doesn't exist.
  probe?(slug: string): Promise<AtsProbe | null>;
  // Throws when the board can't be read.
  fetchJobs(slug: string): Promise<RawJob[]>;
  // Only for ATSs whose job list omits the description (one extra request per job).
  // Takes the job's own url, since that alone identifies it on these boards.
  fetchDescription?(job: { externalId: string; url: string | null }): Promise<string | null>;
  // The same, for ATSs whose detail call also carries the posting date, so one request gives both
  // (used in place of fetchDescription). Null when the call failed, as opposed to a detail with no
  // description and no date.
  fetchDetails?(job: { externalId: string; url: string | null }): Promise<JobDetails | null>;
};

export function expectOk(status: number, what: string): void {
  if (status !== 200) throw new Error(`${what}: HTTP ${status}`);
}

// Serbia wins for multi-location postings; otherwise only an unambiguous single country counts.
export function pickCountry(codes: (string | null | undefined)[]): string | null {
  const unique = new Set(
    codes.map((code) => code?.toLowerCase()).filter((code): code is string => Boolean(code)),
  );
  if (unique.has("rs")) return "rs";
  return unique.size === 1 ? [...unique][0] : null;
}

export function joinLocations(parts: (string | null | undefined)[]): string | null {
  const unique = [...new Set(parts.map((part) => part?.trim()).filter(Boolean))];
  return unique.length ? unique.join(" / ") : null;
}
