import type { CallbackApplicationState, CallbackStatus } from "@/lib/cvs/types";
import type { ExternalSource } from "@/lib/external-jobs/sources";

export const APPLICATION_STATUSES = ["PENDING", "NO_ANSWER", "REJECTED", "OFFER"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  PENDING: "Pending",
  NO_ANSWER: "Long time no answer",
  REJECTED: "Rejected",
  OFFER: "Got offer",
};

// A job the candidate tracks by hand: an `applications` row joined with its job (see
// supabase/migrations/*_applications_status.sql), mapped to camelCase. `active` is the job's, not
// the application's: an inactive job stays listed and is shown as Expired — see features/applied.md.
export type ManualApplicationItem = {
  kind: "manual";
  jobId: string;
  status: ApplicationStatus;
  appliedAt: string;
  title: string;
  companyName: string;
  url: string | null;
  active: boolean;
};

// An application to a job posted on Callback (features/callback-applications-in-table.md), in the same
// table. Its status is the one the company applied, never chosen by the candidate (null once the
// application is withdrawn), and `state` says whether the job is still open to it.
export type CallbackApplicationItem = {
  kind: "callback";
  // The application's id, and the posting's, which the title opens.
  id: string;
  jobId: string;
  appliedAt: string;
  title: string;
  companyName: string;
  state: CallbackApplicationState;
  status: CallbackStatus | null;
};

// A job the candidate added from another site with the browser extension (features/chrome-extension.md):
// LinkedIn, HelloWorld or Infostud. The candidate's own row, with the same status they change as a job
// tracked by hand, and a CV they may have named. `cvFileName` is filled in by the page from the
// candidate's CVs, because the table of CVs has no client select.
export type ExternalApplicationItem = {
  kind: "external";
  id: string;
  source: ExternalSource;
  status: ApplicationStatus;
  appliedAt: string;
  title: string;
  companyName: string;
  location: string | null;
  url: string;
  cvId: string | null;
  cvFileName: string | null;
};

// One row of the /applications table.
export type ApplicationListItem = ManualApplicationItem | CallbackApplicationItem | ExternalApplicationItem;
