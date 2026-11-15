import { asString, firstString } from "../../scraper/extract/json";
import {
  hiringOrganizationName,
  jobPostingsFromScripts,
  postingPlace,
  type JobPostingRecord,
} from "../../scraper/extract/job-postings";
import { canonicalJobUrl } from "../../src/lib/external-jobs/canonical-url";
import { orNull } from "./dom";

// The JobPosting a job page embeds for Google Jobs (JSON-LD), read from the page the extension is on. The
// walker is the scraper's own (scraper/extract/job-postings.ts); only reading the scripts out of the
// Document is done here.

export function jobPostingsOf(doc: Document): JobPostingRecord[] {
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  return jobPostingsFromScripts(scripts.map((script) => script.textContent ?? ""));
}

export type PostingLookup =
  // The posting that is about the job in the address.
  | { kind: "found"; posting: JobPostingRecord }
  // The page embeds postings, and none is about this job: after a move to another job inside the page
  // (Infostud is a single-page app), the head's scripts can still be the previous job's for a moment, and
  // its title must not go with the new address. The page's own text is as old, so nothing is read.
  | { kind: "stale" }
  // The page embeds no posting at all.
  | { kind: "none" };

// A posting with no `url` can't be told apart, and is taken.
export function lookUpPosting(doc: Document, canonicalUrl: string): PostingLookup {
  const postings = jobPostingsOf(doc);
  const posting = postings.find((candidate) => {
    const postingUrl = asString(candidate.url);
    return !postingUrl || canonicalJobUrl(postingUrl)?.url === canonicalUrl;
  });
  if (posting) return { kind: "found", posting };
  return postings.length > 0 ? { kind: "stale" } : { kind: "none" };
}

export type PostingDetails = { title: string | null; company: string | null; location: string | null };

// "Accounting Officer - SLVWZ d.o.o." at SLVWZ d.o.o. is "Accounting Officer": the company is already
// the next field, so a title that ends with its name loses it.
export function withoutCompanySuffix(title: string, company: string | null): string {
  if (!company) return title;
  const suffix = ` - ${company}`;
  return title.toLowerCase().endsWith(suffix.toLowerCase()) && title.length > suffix.length
    ? title.slice(0, title.length - suffix.length).trim()
    : title;
}

export function detailsOf(posting: JobPostingRecord): PostingDetails {
  const company = orNull(hiringOrganizationName(posting));
  const rawTitle = orNull(firstString(posting, ["title", "name"]));
  return {
    title: rawTitle ? withoutCompanySuffix(rawTitle, company) : null,
    company,
    location: orNull(postingPlace(posting.jobLocation, { joinLocalityLists: true }).text),
  };
}
