// The status of an application on the employer's side (features/application-status.md), in the order
// of the pipeline, with Rejected last. In the code it is a stage, so it isn't confused with the
// candidate-side tracker's status (src/lib/applications/types.ts); the screen calls it Status.
export const HIRING_STAGES = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"] as const;
export type HiringStage = (typeof HIRING_STAGES)[number];

export const HIRING_STAGE_LABELS: Record<HiringStage, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

// The key that sets each status on the review screen.
export const HIRING_STAGE_KEYS: Record<HiringStage, string> = {
  APPLIED: "1",
  SCREENING: "2",
  INTERVIEW: "3",
  OFFER: "4",
  HIRED: "5",
  REJECTED: "R",
};

export function stageForKey(key: string): HiringStage | null {
  return HIRING_STAGES.find((stage) => HIRING_STAGE_KEYS[stage] === key.toUpperCase()) ?? null;
}
