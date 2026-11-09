// The candidate's side of features/candidate-cvs.md, as the pages and the apply dialog see it. Plain
// module: client components use the types.

// A CV on the candidate's account. `activeOn` names the jobs ("Title at Company") whose active
// applications use it; while there is one, the CV can't be deleted.
export type CandidateCv = {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  activeOn: string[];
};

// Where an application to a job posted on Callback stands, for the candidate (my_job_applications()).
export const CALLBACK_APPLICATION_STATES = ["active", "paused", "withdrawn", "you_withdrew"] as const;
export type CallbackApplicationState = (typeof CALLBACK_APPLICATION_STATES)[number];

export const CALLBACK_APPLICATION_STATE_LABELS: Record<CallbackApplicationState, string> = {
  active: "Active",
  paused: "Paused by the company",
  withdrawn: "Withdrawn by the company",
  you_withdrew: "You withdrew",
};

export type CallbackApplication = {
  id: string;
  jobId: string;
  title: string;
  companyName: string;
  appliedAt: string;
  state: CallbackApplicationState;
  // Null once the application is withdrawn: it holds no documents then.
  cvFileName: string | null;
  coverLetter: { kind: "text"; text: string } | { kind: "pdf" } | null;
};

// The candidate's own CV, opened in a new tab (src/app/api/cvs/[cvId]/route.ts).
export function cvUrl(cvId: string): string {
  return `/api/cvs/${cvId}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
