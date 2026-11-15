import type { CallbackApplication, CallbackStatus, CandidateCv } from "@/lib/cvs/types";
import type {
  ApplicationListItem,
  ApplicationStatus,
  CallbackApplicationItem,
  ExternalApplicationItem,
  ManualApplicationItem,
} from "./types";

// The /applications table's one list of three kinds of application (features/callback-applications-in-table.md,
// features/chrome-extension.md): the jobs the candidate tracks by hand, the applications to jobs posted
// on Callback, whose status the company sets, and the jobs they added from LinkedIn, HelloWorld or
// Infostud. Plain module: the table uses it in the browser.

export type SortField = "title" | "company" | "applied" | "status";

export function fromCallbackApplication(application: CallbackApplication): CallbackApplicationItem {
  return {
    kind: "callback",
    id: application.id,
    jobId: application.jobId,
    appliedAt: application.appliedAt,
    title: application.title,
    companyName: application.companyName,
    state: application.state,
    status: application.status,
  };
}

export function mergeApplications(
  manual: readonly ManualApplicationItem[],
  callback: readonly CallbackApplication[],
  external: readonly ExternalApplicationItem[] = [],
): ApplicationListItem[] {
  return [...manual, ...callback.map(fromCallbackApplication), ...external];
}

// The external applications with the name of the CV each one used. The table of CVs has no client select
// (supabase/migrations/20261109150000_candidate_cvs.sql), so the names come from the CVs the page has
// already read. A CV that is no longer on the account has no name: the row shows none.
export function withCvFileNames(
  external: readonly ExternalApplicationItem[],
  cvs: readonly Pick<CandidateCv, "id" | "fileName">[],
): ExternalApplicationItem[] {
  const fileNames = new Map(cvs.map((cv) => [cv.id, cv.fileName]));
  return external.map((item) => ({ ...item, cvFileName: item.cvId ? (fileNames.get(item.cvId) ?? null) : null }));
}

// The one question both the table and the keys ask: is this an application to a job posted on Callback?
export function isCallbackItem(item: ApplicationListItem): item is CallbackApplicationItem {
  return item.kind === "callback";
}

// A job added from another site with the browser extension, which the candidate can also remove.
export function isExternalItem(item: ApplicationListItem): item is ExternalApplicationItem {
  return item.kind === "external";
}

// A manual row is the scraped job's id, a Callback or an external one its own row's id: they can't clash.
export function itemKey(item: ApplicationListItem): string {
  if (isCallbackItem(item)) return `callback:${item.id}`;
  if (isExternalItem(item)) return `external:${item.id}`;
  return `manual:${item.jobId}`;
}

// Whether the job is still open to the application. Not the same as "active" to the company: a job the
// scraper took down, and one the company paused or withdrew the application from, are shown gray. A job
// on another site is open: we don't look at it again.
export function isOpenItem(item: ApplicationListItem): boolean {
  if (isExternalItem(item)) return true;
  return isCallbackItem(item) ? item.state === "active" : item.active;
}

// How the statuses of the kinds sort together: waiting first, a company's step next, then no answer,
// Rejected and Got offer (the order of the dropdown), and last an application that holds no status.
const MANUAL_RANK: Record<ApplicationStatus, number> = { PENDING: 0, NO_ANSWER: 2, REJECTED: 3, OFFER: 4 };
const CALLBACK_RANK: Record<CallbackStatus["stage"], number> = { APPLIED: 0, STEP: 1, REJECTED: 3, OFFER: 4 };
const NO_STATUS_RANK = 5;

export function statusRank(item: ApplicationListItem): number {
  if (item.kind === "callback") return item.status ? CALLBACK_RANK[item.status.stage] : NO_STATUS_RANK;
  return MANUAL_RANK[item.status];
}

export function compareApplications(first: ApplicationListItem, second: ApplicationListItem, field: SortField): number {
  switch (field) {
    case "title":
      return first.title.localeCompare(second.title);
    case "company":
      return first.companyName.localeCompare(second.companyName);
    case "applied":
      return Date.parse(first.appliedAt) - Date.parse(second.appliedAt);
    case "status":
      return statusRank(first) - statusRank(second);
  }
}
