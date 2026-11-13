// Where an application stands in the company's pipeline (features/candidate-steps.md): Applied, then
// the company's own steps (up to 10, defined in its settings), then Offer, with Rejected possible at any
// point. In the code it is a stage, so it isn't confused with the candidate-side tracker's status
// (src/lib/applications/types.ts); the screen calls it Status.
export const PIPELINE_STAGES = ["APPLIED", "STEP", "OFFER", "REJECTED"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const MAX_CANDIDATE_STEPS = 10;

// One of the company's own steps, as the employer sees it. `usedAt` is when an application was first
// put on it: from then on it can be renamed, but not deleted.
export type CandidateStep = {
  id: string;
  position: number;
  name: string;
  description: string;
  usedAt: string | null;
  updatedAt: string;
  // An interview step (features/interview-invitations.md): applying a candidate to it offers to send a
  // Google Meet invitation.
  schedulesInterview: boolean;
};

// A stage, and for a STEP which one. `stepId` is set exactly when `stage` is "STEP".
export type StageChoice = { stage: PipelineStage; stepId: string | null };

export const APPLIED_CHOICE: StageChoice = { stage: "APPLIED", stepId: null };

export function isValidChoice(choice: StageChoice): boolean {
  return (choice.stage === "STEP") === (choice.stepId !== null);
}

// A stable text for a choice, for keys, filters and comparisons.
export function stageChoiceKey(choice: StageChoice): string {
  return choice.stage === "STEP" ? `STEP:${choice.stepId}` : choice.stage;
}

export function sameChoice(first: StageChoice, second: StageChoice): boolean {
  return stageChoiceKey(first) === stageChoiceKey(second);
}

// What the employer sees for each stage. Offer is "Offer" here and "Got offer" to the candidate, as in
// their own tracker (src/lib/applications/types.ts).
export const EMPLOYER_STAGE_LABELS = { APPLIED: "Applied", OFFER: "Offer", REJECTED: "Rejected" } as const;
export const CANDIDATE_STAGE_LABELS = { APPLIED: "Applied", OFFER: "Got offer", REJECTED: "Rejected" } as const;

// The keys that set a status on the review screen: A for Applied, 1 to 9 and 0 for the steps in order,
// O for Offer and R for Rejected. L is the heart.
const STEP_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

// One button of the status control: the choice, how it reads and the key that sets it.
export type StageOption = {
  key: string;
  choice: StageChoice;
  label: string;
  shortcut: string;
};

// Every status the employer can choose, in the pipeline's order with Rejected last.
export function stageOptions(steps: readonly CandidateStep[]): StageOption[] {
  const ordered = [...steps].sort((first, second) => first.position - second.position);
  const options: StageOption[] = [
    { key: "APPLIED", choice: APPLIED_CHOICE, label: EMPLOYER_STAGE_LABELS.APPLIED, shortcut: "A" },
    ...ordered.slice(0, STEP_KEYS.length).map((step, index) => {
      const choice: StageChoice = { stage: "STEP", stepId: step.id };
      return { key: stageChoiceKey(choice), choice, label: step.name, shortcut: STEP_KEYS[index] };
    }),
    { key: "OFFER", choice: { stage: "OFFER", stepId: null }, label: EMPLOYER_STAGE_LABELS.OFFER, shortcut: "O" },
    {
      key: "REJECTED",
      choice: { stage: "REJECTED", stepId: null },
      label: EMPLOYER_STAGE_LABELS.REJECTED,
      shortcut: "R",
    },
  ];
  return options;
}

export function optionForKey(options: readonly StageOption[], key: string): StageOption | null {
  const upper = key.toUpperCase();
  return options.find((option) => option.shortcut === upper) ?? null;
}

// How a choice reads to the employer. A step that isn't in the list (it can't be deleted once used, so
// this is only a list that hasn't loaded) reads as "Step".
export function choiceLabel(choice: StageChoice, options: readonly StageOption[]): string {
  const key = stageChoiceKey(choice);
  return options.find((option) => option.key === key)?.label ?? "Step";
}
