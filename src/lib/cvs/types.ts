// The candidate's side of features/candidate-cvs.md, as the pages and the apply dialog see it. Plain
// module: client components use the types.

import type { CandidateInterview } from "@/lib/interviews/types";
import type { PipelineStage } from "@/lib/review/stages";

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

// The status the company has shown the candidate (features/candidate-steps.md). For a STEP, the
// company's step as it is now: its name, the text behind the info icon, and when the step was last
// edited.
export type CallbackStatus = {
  stage: PipelineStage;
  stepName: string | null;
  stepDescription: string | null;
  // When the company applied it to this application, and when its step was last edited.
  stageAt: string | null;
  stepUpdatedAt: string | null;
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
  // Null once the application is withdrawn: there is no status to follow then.
  status: CallbackStatus | null;
  // The company's latest interview invitation (features/interview-invitations.md), or null.
  interview: CandidateInterview | null;
};

// The candidate's own CV, opened in a new tab (src/app/api/cvs/[cvId]/route.ts).
export function cvUrl(cvId: string): string {
  return `/api/cvs/${cvId}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
