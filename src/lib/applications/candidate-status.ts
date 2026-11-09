import { CANDIDATE_STAGE_LABELS } from "@/lib/review/stages";
import type { CallbackStatus } from "@/lib/cvs/types";

// How a status the company applied reads to the candidate (features/candidate-steps.md): the label,
// the text behind the info icon (only a company's own step has one), and when the step was edited
// after the candidate was moved to it, so the text they read may differ from what they were first told.
export type CandidateStatusView = {
  label: string;
  description: string | null;
  // An ISO time, or null when the step hasn't been edited since.
  editedAt: string | null;
};

export function candidateStatusView(status: CallbackStatus): CandidateStatusView {
  if (status.stage !== "STEP") {
    return { label: CANDIDATE_STAGE_LABELS[status.stage], description: null, editedAt: null };
  }
  const edited =
    status.stageAt !== null &&
    status.stepUpdatedAt !== null &&
    Date.parse(status.stepUpdatedAt) > Date.parse(status.stageAt);
  return {
    label: status.stepName ?? "In progress",
    description: status.stepDescription,
    editedAt: edited ? status.stepUpdatedAt : null,
  };
}
