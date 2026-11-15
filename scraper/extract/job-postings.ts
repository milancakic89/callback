import { asArray, asRecord, asString } from "./json";

// schema.org JobPosting in JSON-LD, as sites embed it for Google Jobs. No cheerio and nothing else of the
// scraper's: the scraper reads the scripts out of a page's HTML (json-ld.ts), and the browser extension
// reads them out of the page it is on (extension/src/job-posting.ts), and both walk them here.

export type JobPostingRecord = Record<string, unknown>;

// Every JobPosting in a parsed JSON-LD document, including the ones inside @graph and list items.
export function collectPostings(node: unknown, out: JobPostingRecord[]): void {
  for (const item of asArray(node)) {
    const record = asRecord(item);
    if (!record) continue;
    if (asArray(record["@type"]).includes("JobPosting")) out.push(record);
    if (record["@graph"]) collectPostings(record["@graph"], out);
    if (record.itemListElement) collectPostings(record.itemListElement, out);
    if (record.item) collectPostings(record.item, out);
  }
}

// The JobPostings in the text of a page's `<script type="application/ld+json">` elements. A script that
// isn't valid JSON is skipped: malformed JSON-LD is common.
export function jobPostingsFromScripts(scriptTexts: Iterable<string>): JobPostingRecord[] {
  const postings: JobPostingRecord[] = [];
  for (const text of scriptTexts) {
    try {
      collectPostings(JSON.parse(text), postings);
    } catch {
      // Skip it.
    }
  }
  return postings;
}

// The company a posting is for: `hiringOrganization` is an Organization with a name, a plain name, or a
// list of them.
export function hiringOrganizationName(posting: JobPostingRecord): string | null {
  for (const organization of asArray(posting.hiringOrganization)) {
    const name = asString(asRecord(organization)?.name) ?? asString(organization);
    if (name) return name;
  }
  return null;
}

// Where a posting is, from its `jobLocation` (one place or several): "Locality, Region, Country" joined by
// " / ", and the country when it is a two-letter code. A locality that is a list (Infostud writes
// ["Beograd"]) is skipped, as the scraper always did, unless `joinLocalityLists` asks for it to be joined.
export function postingPlace(
  value: unknown,
  { joinLocalityLists = false }: { joinLocalityLists?: boolean } = {},
): { text: string | null; country: string | null } {
  const parts: string[] = [];
  let country: string | null = null;
  for (const item of asArray(value)) {
    const address = asRecord(asRecord(item)?.address) ?? asRecord(item);
    if (!address) continue;
    const countryValue = asString(address.addressCountry) ?? asString(asRecord(address.addressCountry)?.name);
    if (countryValue && countryValue.length === 2) country ??= countryValue.toLowerCase();
    const locality = joinLocalityLists
      ? asArray(address.addressLocality).flatMap((entry) => asString(entry) ?? []).join(", ") || null
      : asString(address.addressLocality);
    const line = [locality, asString(address.addressRegion), countryValue].filter(Boolean).join(", ");
    if (line) parts.push(line);
  }
  return { text: parts.length ? [...new Set(parts)].join(" / ") : null, country };
}
