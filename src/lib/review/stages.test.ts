import { describe, expect, it } from "vitest";
import { HIRING_STAGE_KEYS, HIRING_STAGES, stageForKey } from "./stages";

describe("stageForKey", () => {
  it("finds each status by its key", () => {
    expect(stageForKey("1")).toBe("APPLIED");
    expect(stageForKey("3")).toBe("INTERVIEW");
    expect(stageForKey("5")).toBe("HIRED");
    expect(stageForKey("R")).toBe("REJECTED");
  });

  it("takes R in either case", () => {
    expect(stageForKey("r")).toBe("REJECTED");
  });

  it("answers null for any other key", () => {
    for (const key of ["0", "6", "l", "L", "ArrowRight", "Escape", ""]) {
      expect(stageForKey(key), key).toBeNull();
    }
  });

  it("gives every status a key of its own", () => {
    const keys = HIRING_STAGES.map((stage) => HIRING_STAGE_KEYS[stage]);
    expect(new Set(keys).size).toBe(HIRING_STAGES.length);
  });
});
