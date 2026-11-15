import { canonicalJobUrl } from "./canonical-url";

// The link the browser extension's button opens (features/chrome-extension.md): a page of callback.rs
// with the job the candidate was looking at in its address. Plain module, no dependencies beyond the
// address rules: the extension builds the link with it, and the server reads it back
// (track-query.ts). Nothing in the address is trusted on arrival; this only makes it well formed.

export const TRACK_PATH = "/applications/new";
export const TITLE_MAX = 200;
export const COMPANY_MAX = 200;
export const LOCATION_MAX = 200;
// How many jobs a candidate can add; the database has the final say (errcode 54000).
export const EXTERNAL_APPLICATIONS_MAX = 1000;

// What a page of a job site tells about its job. The title and company are what the candidate checks
// before saving; any of them can be missing when the site changes.
export type TrackJob = {
  url: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
};

// The query parameters of the link, which are the only ones the server accepts.
export const TRACK_PARAMS = ["url", "title", "company", "location"] as const;

// Text read off a page: control characters (a newline, a tab, the C0 and C1 ranges) become a space, and
// invisible and direction-changing marks (zero-width spaces, bidi overrides, the byte order mark) are
// dropped, so a title can't look like something else. Runs of whitespace become one space, and the ends
// are trimmed.
export function cleanLinkText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// At most `max` characters, as Postgres counts them: a character outside the BMP is one, never cut in
// half.
export function capText(value: string, max: number): string {
  const characters = Array.from(value);
  return characters.length <= max ? value : characters.slice(0, max).join("").trim();
}

function cleanedField(value: string | null | undefined, max: number): string {
  return capText(cleanLinkText(value ?? ""), max);
}

// "/applications/new?url=…&title=…": the path and query of the link, for a job whose address is one of
// the three sites'. The address is reduced to its canonical form here too, so a link is never built
// for a page the server would refuse. Throws for an address that isn't a job of those sites.
export function buildTrackPath(job: TrackJob): string {
  const canonical = canonicalJobUrl(job.url);
  if (!canonical) throw new Error("Not a job page of a supported site.");

  const query = new URLSearchParams({ url: canonical.url });
  const fields: [string, string][] = [
    ["title", cleanedField(job.title, TITLE_MAX)],
    ["company", cleanedField(job.company, COMPANY_MAX)],
    ["location", cleanedField(job.location, LOCATION_MAX)],
  ];
  for (const [name, value] of fields) {
    if (value) query.set(name, value);
  }
  return `${TRACK_PATH}?${query.toString()}`;
}
