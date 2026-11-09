import { describe, expect, it } from "vitest";
import {
  initialStageStates,
  pendingStageChanges,
  revertStage,
  withApplied,
  withStage,
  type StageStates,
} from "./pending-stages";
import { APPLIED_CHOICE, type StageChoice } from "./stages";

const SCREENING: StageChoice = { stage: "STEP", stepId: "11111111-1111-4111-8111-111111111111" };
const INTERVIEW: StageChoice = { stage: "STEP", stepId: "22222222-2222-4222-8222-222222222222" };
const REJECTED: StageChoice = { stage: "REJECTED", stepId: null };

const people = [
  { id: "ana", name: "Ana Novak" },
  { id: "jonas", name: "Jonas Weber" },
  { id: "mia", name: "Mia Costa" },
];

const states = (): StageStates => ({
  ana: { stage: APPLIED_CHOICE, candidateStage: APPLIED_CHOICE },
  jonas: { stage: INTERVIEW, candidateStage: INTERVIEW },
  mia: { stage: REJECTED, candidateStage: SCREENING },
});

describe("initialStageStates", () => {
  it("keeps what the employer chose and what the candidate sees, for each applicant", () => {
    expect(
      initialStageStates([
        { id: "ana", stage: SCREENING, candidateStage: APPLIED_CHOICE },
        { id: "jonas", stage: INTERVIEW, candidateStage: INTERVIEW },
      ]),
    ).toEqual({
      ana: { stage: SCREENING, candidateStage: APPLIED_CHOICE },
      jonas: { stage: INTERVIEW, candidateStage: INTERVIEW },
    });
  });
});

describe("withStage", () => {
  it("changes the employer's choice and leaves what the candidate sees", () => {
    const next = withStage(states(), "ana", SCREENING);

    expect(next.ana).toEqual({ stage: SCREENING, candidateStage: APPLIED_CHOICE });
    expect(next.jonas).toEqual(states().jonas);
  });

  it("does not change the state it was given", () => {
    const before = states();
    withStage(before, "ana", SCREENING);
    expect(before).toEqual(states());
  });

  it("ignores an applicant that isn't there", () => {
    const before = states();
    expect(withStage(before, "nobody", SCREENING)).toBe(before);
  });
});

describe("revertStage", () => {
  it("puts the previous status back after a failed save", () => {
    const changed = withStage(states(), "ana", SCREENING);

    expect(revertStage(changed, "ana", SCREENING, APPLIED_CHOICE).ana.stage).toEqual(APPLIED_CHOICE);
  });

  it("leaves a newer choice alone", () => {
    const newer = withStage(withStage(states(), "ana", SCREENING), "ana", INTERVIEW);

    expect(revertStage(newer, "ana", SCREENING, APPLIED_CHOICE)).toBe(newer);
  });
});

describe("pendingStageChanges", () => {
  it("lists the applicants whose status the candidate hasn't been shown, in the order given", () => {
    expect(pendingStageChanges(states(), people)).toEqual([
      { id: "mia", name: "Mia Costa", from: SCREENING, to: REJECTED },
    ]);

    const more = withStage(states(), "ana", SCREENING);
    expect(pendingStageChanges(more, people).map((change) => change.id)).toEqual(["ana", "mia"]);
  });

  it("is empty when the candidates see what the employer chose", () => {
    expect(pendingStageChanges(initialStageStates([{ id: "ana", stage: APPLIED_CHOICE, candidateStage: APPLIED_CHOICE }]), people)).toEqual([]);
  });

  it("counts a change back to what the candidate sees as nothing pending", () => {
    const there = withStage(states(), "jonas", SCREENING);
    const back = withStage(there, "jonas", INTERVIEW);

    expect(pendingStageChanges(there, people).map((change) => change.id)).toContain("jonas");
    expect(pendingStageChanges(back, people).map((change) => change.id)).not.toContain("jonas");
  });

  it("follows the order of the people it is given", () => {
    const reversed = [...people].reverse();
    const more = withStage(states(), "ana", SCREENING);

    expect(pendingStageChanges(more, reversed).map((change) => change.id)).toEqual(["mia", "ana"]);
  });
});

describe("withApplied", () => {
  it("shows the candidates what was sent", () => {
    const [change] = pendingStageChanges(states(), people);
    const next = withApplied(states(), [change]);

    expect(next.mia.candidateStage).toEqual(REJECTED);
    expect(pendingStageChanges(next, people)).toEqual([]);
  });

  it("shows what was sent, not what the employer has chosen since", () => {
    const [change] = pendingStageChanges(states(), people);
    const chosenSince = withStage(states(), "mia", INTERVIEW);
    const next = withApplied(chosenSince, [change]);

    expect(next.mia).toEqual({ stage: INTERVIEW, candidateStage: REJECTED });
    expect(pendingStageChanges(next, people).map((pending) => pending.id)).toEqual(["mia"]);
  });

  it("leaves the others as they were", () => {
    const [change] = pendingStageChanges(states(), people);
    expect(withApplied(states(), [change]).jonas).toEqual(states().jonas);
  });
});
