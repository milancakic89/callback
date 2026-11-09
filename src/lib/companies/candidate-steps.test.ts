import { describe, expect, it } from "vitest";
import {
  addStep,
  candidateStepsSchema,
  canAddStep,
  canRemoveStep,
  draftsFromSteps,
  moveStep,
  removeStep,
  settingsPath,
  STEP_DESCRIPTION_MAX,
  STEP_NAME_MAX,
  stepFieldErrors,
  toCandidateStep,
  toStepInputs,
  updateStep,
  type StepDraft,
} from "./candidate-steps";
import { MAX_CANDIDATE_STEPS, type CandidateStep } from "@/lib/review/stages";

const ID_ONE = "11111111-1111-4111-8111-111111111111";
const ID_TWO = "22222222-2222-4222-8222-222222222222";

const input = (name: string, description = "What happens in this step.", id: string | null = null) => ({
  id,
  name,
  description,
});

const step = (id: string, position: number, name: string, usedAt: string | null = null): CandidateStep => ({
  id,
  position,
  name,
  description: `About ${name}`,
  usedAt,
  updatedAt: "2026-11-09T10:00:00+00:00",
});

const draft = (key: string, name: string, locked = false): StepDraft => ({
  key,
  id: locked ? key : null,
  name,
  description: `About ${name}`,
  locked,
});

describe("candidateStepsSchema", () => {
  it("accepts no steps, since a company may not have any", () => {
    expect(candidateStepsSchema.safeParse([]).success).toBe(true);
  });

  it("trims the name and the text and normalises line breaks", () => {
    const parsed = candidateStepsSchema.parse([input("  Interview  ", "  One\r\nTwo  ", ID_ONE)]);

    expect(parsed).toEqual([{ id: ID_ONE, name: "Interview", description: "One\nTwo" }]);
  });

  it("needs a name and a text", () => {
    const result = candidateStepsSchema.safeParse([input("   ", "text"), input("Interview", "   ")]);

    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = stepFieldErrors(result.error);
    expect(errors["steps.0.name"]).toEqual(["Give the step a name."]);
    expect(errors["steps.1.description"]).toEqual(["Tell the candidate what this step means."]);
  });

  it("holds a name to 60 characters and a text to 500", () => {
    expect(candidateStepsSchema.safeParse([input("a".repeat(STEP_NAME_MAX), "b".repeat(STEP_DESCRIPTION_MAX))]).success).toBe(true);

    const result = candidateStepsSchema.safeParse([input("a".repeat(STEP_NAME_MAX + 1), "b".repeat(STEP_DESCRIPTION_MAX + 1))]);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(stepFieldErrors(result.error)).sort()).toEqual(["steps.0.description", "steps.0.name"]);
  });

  it("allows 10 steps and refuses 11", () => {
    const steps = (count: number) => Array.from({ length: count }, (_, index) => input(`Step ${index + 1}`));

    expect(candidateStepsSchema.safeParse(steps(MAX_CANDIDATE_STEPS)).success).toBe(true);
    const result = candidateStepsSchema.safeParse(steps(MAX_CANDIDATE_STEPS + 1));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(stepFieldErrors(result.error).steps).toEqual(["Use at most 10 steps."]);
  });

  it("refuses the names Applied, Offer, Got offer and Rejected in any case", () => {
    for (const name of ["Applied", "offer", "GOT OFFER", "rejected"]) {
      expect(candidateStepsSchema.safeParse([input(name)]).success, name).toBe(false);
    }
    expect(candidateStepsSchema.safeParse([input("Offer call")]).success).toBe(true);
  });

  it("refuses a name used twice, ignoring case, on the second one", () => {
    const result = candidateStepsSchema.safeParse([input("Interview"), input("Screening"), input("interview ")]);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(stepFieldErrors(result.error)).toEqual({ "steps.2.name": ["Two steps can't have the same name."] });
  });

  it("refuses an id that isn't a uuid, and anything that isn't a list", () => {
    expect(candidateStepsSchema.safeParse([input("Interview", "text", "nope")]).success).toBe(false);
    for (const notAList of [null, undefined, "steps", {}, 1]) {
      expect(candidateStepsSchema.safeParse(notAList).success, String(notAList)).toBe(false);
    }
  });
});

describe("the list in the form", () => {
  it("starts from the saved steps in their order, locking the ones that were used", () => {
    const drafts = draftsFromSteps([
      step(ID_TWO, 2, "Interview", "2026-11-09T10:00:00+00:00"),
      step(ID_ONE, 1, "Screening"),
    ]);

    expect(drafts.map((entry) => entry.name)).toEqual(["Screening", "Interview"]);
    expect(drafts.map((entry) => entry.locked)).toEqual([false, true]);
    expect(drafts[0].id).toBe(ID_ONE);
  });

  it("adds a new empty step at the end, with no id, up to 10", () => {
    const one = addStep([], "key-1");
    expect(one).toEqual([{ key: "key-1", id: null, name: "", description: "", locked: false }]);

    const full = Array.from({ length: MAX_CANDIDATE_STEPS }, (_, index) => draft(`k${index}`, `Step ${index}`));
    expect(canAddStep(full)).toBe(false);
    expect(addStep(full, "extra")).toHaveLength(MAX_CANDIDATE_STEPS);
    expect(canAddStep(full.slice(1))).toBe(true);
  });

  it("removes a step that no application has been on", () => {
    const drafts = [draft("a", "A"), draft("b", "B")];

    expect(removeStep(drafts, 0).map((entry) => entry.key)).toEqual(["b"]);
  });

  it("does not remove a step that has been used", () => {
    const drafts = [draft("a", "A", true), draft("b", "B")];

    expect(canRemoveStep(drafts[0])).toBe(false);
    expect(removeStep(drafts, 0)).toEqual(drafts);
  });

  it("ignores removing a step that isn't there", () => {
    const drafts = [draft("a", "A")];
    expect(removeStep(drafts, 3)).toEqual(drafts);
  });

  it("moves a step up and down, and stays put at the ends", () => {
    const drafts = [draft("a", "A"), draft("b", "B"), draft("c", "C")];

    expect(moveStep(drafts, 1, "up").map((entry) => entry.key)).toEqual(["b", "a", "c"]);
    expect(moveStep(drafts, 1, "down").map((entry) => entry.key)).toEqual(["a", "c", "b"]);
    expect(moveStep(drafts, 0, "up")).toEqual(drafts);
    expect(moveStep(drafts, 2, "down")).toEqual(drafts);
    expect(moveStep(drafts, 5, "up")).toEqual(drafts);
  });

  it("changes the name or the text of one step and leaves the rest", () => {
    const drafts = [draft("a", "A"), draft("b", "B")];
    const next = updateStep(drafts, 1, { name: "Better" });

    expect(next[1]).toMatchObject({ key: "b", name: "Better", description: "About B" });
    expect(next[0]).toBe(drafts[0]);
  });

  it("sends the id, the name and the text, in order, and nothing else", () => {
    const drafts = [draft(ID_ONE, "A", true), draft("new", "B")];

    expect(toStepInputs(drafts)).toEqual([
      { id: ID_ONE, name: "A", description: "About A" },
      { id: null, name: "B", description: "About B" },
    ]);
  });
});

describe("helpers", () => {
  it("maps a database row field by field", () => {
    expect(
      toCandidateStep({
        id: ID_ONE,
        position: 1,
        name: "Screening",
        description: "We read it.",
        used_at: null,
        updated_at: "2026-11-09T10:00:00+00:00",
      }),
    ).toEqual({
      id: ID_ONE,
      position: 1,
      name: "Screening",
      description: "We read it.",
      usedAt: null,
      updatedAt: "2026-11-09T10:00:00+00:00",
    });
  });

  it("names the settings page", () => {
    expect(settingsPath("acme")).toBe("/acme/settings");
  });
});
