import { describe, expect, it } from "vitest";
import {
  APPLIED_CHOICE,
  choiceLabel,
  isValidChoice,
  MAX_CANDIDATE_STEPS,
  optionForKey,
  sameChoice,
  stageChoiceKey,
  stageOptions,
  type CandidateStep,
} from "./stages";

const step = (id: string, position: number, name: string): CandidateStep => ({
  id,
  position,
  name,
  description: `About ${name}`,
  usedAt: null,
  updatedAt: "2026-11-09T10:00:00+00:00",
});

const SCREENING = step("11111111-1111-4111-8111-111111111111", 1, "Screening");
const INTERVIEW = step("22222222-2222-4222-8222-222222222222", 2, "Interview");

describe("stageOptions", () => {
  it("lists Applied, the steps in the company's order, Offer and Rejected", () => {
    const options = stageOptions([INTERVIEW, SCREENING]);
    expect(options.map((option) => option.label)).toEqual(["Applied", "Screening", "Interview", "Offer", "Rejected"]);
  });

  it("is just Applied, Offer and Rejected for a company without steps", () => {
    expect(stageOptions([]).map((option) => option.label)).toEqual(["Applied", "Offer", "Rejected"]);
  });

  it("gives A to Applied, 1 to 9 and 0 to the steps, O to Offer and R to Rejected", () => {
    const ten = Array.from({ length: MAX_CANDIDATE_STEPS }, (_, index) =>
      step(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, index + 1, `Step ${index + 1}`),
    );
    const shortcuts = stageOptions(ten).map((option) => option.shortcut);
    expect(shortcuts).toEqual(["A", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "O", "R"]);
  });

  it("gives every status a key and a shortcut of its own", () => {
    const options = stageOptions([SCREENING, INTERVIEW]);
    expect(new Set(options.map((option) => option.key)).size).toBe(options.length);
    expect(new Set(options.map((option) => option.shortcut)).size).toBe(options.length);
  });

  it("never uses L, which is the heart", () => {
    expect(stageOptions([SCREENING]).some((option) => option.shortcut === "L")).toBe(false);
  });

  it("names a step by its id", () => {
    const [, screening] = stageOptions([SCREENING]);
    expect(screening.choice).toEqual({ stage: "STEP", stepId: SCREENING.id });
  });
});

describe("optionForKey", () => {
  const options = stageOptions([SCREENING, INTERVIEW]);

  it("finds each status by its key", () => {
    expect(optionForKey(options, "a")?.label).toBe("Applied");
    expect(optionForKey(options, "1")?.label).toBe("Screening");
    expect(optionForKey(options, "2")?.label).toBe("Interview");
    expect(optionForKey(options, "O")?.label).toBe("Offer");
    expect(optionForKey(options, "R")?.label).toBe("Rejected");
  });

  it("takes letters in either case", () => {
    expect(optionForKey(options, "r")?.label).toBe("Rejected");
    expect(optionForKey(options, "o")?.label).toBe("Offer");
  });

  it("answers null for a key with no status", () => {
    for (const key of ["3", "0", "l", "L", "ArrowRight", "Escape", ""]) {
      expect(optionForKey(options, key), key).toBeNull();
    }
  });
});

describe("choices", () => {
  it("compares by the stage and, for a step, which one", () => {
    const screening = { stage: "STEP", stepId: SCREENING.id } as const;
    const interview = { stage: "STEP", stepId: INTERVIEW.id } as const;
    expect(sameChoice(screening, { ...screening })).toBe(true);
    expect(sameChoice(screening, interview)).toBe(false);
    expect(sameChoice(APPLIED_CHOICE, screening)).toBe(false);
    expect(stageChoiceKey(APPLIED_CHOICE)).toBe("APPLIED");
    expect(stageChoiceKey(screening)).toBe(`STEP:${SCREENING.id}`);
  });

  it("is valid when a step names which one and nothing else does", () => {
    expect(isValidChoice({ stage: "STEP", stepId: SCREENING.id })).toBe(true);
    expect(isValidChoice({ stage: "OFFER", stepId: null })).toBe(true);
    expect(isValidChoice({ stage: "STEP", stepId: null })).toBe(false);
    expect(isValidChoice({ stage: "OFFER", stepId: SCREENING.id })).toBe(false);
  });

  it("reads as the label of its option", () => {
    const options = stageOptions([SCREENING]);
    expect(choiceLabel({ stage: "STEP", stepId: SCREENING.id }, options)).toBe("Screening");
    expect(choiceLabel({ stage: "REJECTED", stepId: null }, options)).toBe("Rejected");
    expect(choiceLabel({ stage: "STEP", stepId: "33333333-3333-4333-8333-333333333333" }, options)).toBe("Step");
  });
});
