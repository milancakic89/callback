export const APPLICATION_STATUSES = ["PENDING", "NO_ANSWER", "REJECTED", "OFFER"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  PENDING: "Pending",
  NO_ANSWER: "Long time no answer",
  REJECTED: "Rejected",
  OFFER: "Got offer",
};

// One row of the /applications table: an `applications` row joined with its job (see
// supabase/migrations/*_applications_status.sql), mapped to camelCase. `active` is the job's, not
// the application's: an inactive job stays listed and is shown as Expired — see features/applied.md.
export type ApplicationListItem = {
  jobId: string;
  status: ApplicationStatus;
  appliedAt: string;
  title: string;
  companyName: string;
  url: string | null;
  active: boolean;
};
