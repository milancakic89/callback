import type { CallbackApplication, CallbackStatus } from "@/lib/cvs/types";
import type {
  ApplicationListItem,
  ApplicationStatus,
  CallbackApplicationItem,
  ManualApplicationItem,
} from "./types";

// The /applications table's one list of two kinds of application (features/callback-applications-in-table.md):
// the jobs the candidate tracks by hand, and the applications to jobs posted on Callback, whose status
// the company sets. Plain module: the table uses it in the browser.

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
): ApplicationListItem[] {
  return [...manual, ...callback.map(fromCallbackApplication)];
}

// The one question both the table and the keys ask: is this an application to a job posted on Callback?
// Anything else is a job tracked by hand.
export function isCallbackItem(item: ApplicationListItem): item is CallbackApplicationItem {
  return item.kind === "callback";
}

// A manual row is the scraped job's id, a Callback one its application's: the two can't clash.
export function itemKey(item: ApplicationListItem): string {
  return isCallbackItem(item) ? `callback:${item.id}` : `manual:${item.jobId}`;
}

// Whether the job is still open to the application. Not the same as "active" to the company: a job the
// scraper took down, and one the company paused or withdrew the application from, are shown gray.
export function isOpenItem(item: ApplicationListItem): boolean {
  return item.kind === "manual" ? item.active : item.state === "active";
}

// How the statuses of both kinds sort together: waiting first, a company's step next, then no answer,
// Rejected and Got offer (the order of the dropdown), and last an application that holds no status.
const MANUAL_RANK: Record<ApplicationStatus, number> = { PENDING: 0, NO_ANSWER: 2, REJECTED: 3, OFFER: 4 };
const CALLBACK_RANK: Record<CallbackStatus["stage"], number> = { APPLIED: 0, STEP: 1, REJECTED: 3, OFFER: 4 };
const NO_STATUS_RANK = 5;

export function statusRank(item: ApplicationListItem): number {
  if (item.kind === "manual") return MANUAL_RANK[item.status];
  return item.status ? CALLBACK_RANK[item.status.stage] : NO_STATUS_RANK;
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
