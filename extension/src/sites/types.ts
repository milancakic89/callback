import type { ExternalSource } from "../../../src/lib/external-jobs/sources";

// What a job page tells about its job: the address, which is always one of the site's own, and what the
// page says of it. The title is what makes a job "found"; the company and the location may be missing,
// and the candidate fills them in on callback.rs.
export type ScrapedJob = {
  url: string;
  title: string;
  company: string | null;
  location: string | null;
};

// One site (features/chrome-extension.md). Each keeps its selectors in ordered constants at the top of
// its file, so a change on the site is a line there.
export type SiteAdapter = {
  source: ExternalSource;
  // Whether the address is a page of a job, whatever the page then holds.
  isJobPage(url: URL): boolean;
  // The job the page is about, or null when it isn't one, or isn't ready yet.
  readJob(doc: Document, url: URL): ScrapedJob | null;
  // The site's own Apply control, which the button is placed after; null when it isn't there.
  findApplyControl(doc: Document): Element | null;
};
