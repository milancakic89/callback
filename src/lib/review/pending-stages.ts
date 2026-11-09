import { sameChoice, type StageChoice } from "./stages";

// The statuses on the review screen (features/candidate-steps.md). Choosing one is saved at once but
// only the employer sees it; "Apply statuses" then shows it to the candidate. So each applicant has two:
// `stage`, the employer's choice, and `candidateStage`, what the candidate sees. They differ while a
// change is pending. All pure, so the screen's state moves are tested without a browser.

export type StageState = { stage: StageChoice; candidateStage: StageChoice };
export type StageStates = Record<string, StageState>;

export function initialStageStates(
  applicants: readonly { id: string; stage: StageChoice; candidateStage: StageChoice }[],
): StageStates {
  return Object.fromEntries(
    applicants.map((applicant) => [applicant.id, { stage: applicant.stage, candidateStage: applicant.candidateStage }]),
  );
}

export function withStage(states: StageStates, id: string, stage: StageChoice): StageStates {
  if (!states[id]) return states;
  return { ...states, [id]: { ...states[id], stage } };
}

// Puts a status back after a failed save, only if nothing newer was chosen while it was saving.
export function revertStage(
  states: StageStates,
  id: string,
  failed: StageChoice,
  previous: StageChoice,
): StageStates {
  if (!states[id] || !sameChoice(states[id].stage, failed)) return states;
  return withStage(states, id, previous);
}

// An applicant whose status the employer changed and the candidate hasn't been shown yet.
export type PendingStageChange = {
  id: string;
  name: string;
  // What the candidate sees now, and what they will see.
  from: StageChoice;
  to: StageChoice;
};

// The pending changes, in the order of `people` (the playlist's).
export function pendingStageChanges(
  states: StageStates,
  people: readonly { id: string; name: string }[],
): PendingStageChange[] {
  const changes: PendingStageChange[] = [];
  for (const person of people) {
    const state = states[person.id];
    if (state && !sameChoice(state.stage, state.candidateStage)) {
      changes.push({ id: person.id, name: person.name, from: state.candidateStage, to: state.stage });
    }
  }
  return changes;
}

// The candidates now see these changes. What they see is what was sent (`to`), not what the employer
// has chosen since.
export function withApplied(states: StageStates, applied: readonly PendingStageChange[]): StageStates {
  const next = { ...states };
  for (const change of applied) {
    if (next[change.id]) next[change.id] = { ...next[change.id], candidateStage: change.to };
  }
  return next;
}
