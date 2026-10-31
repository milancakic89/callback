import { describe, expect, it } from "vitest";
import { summarizeFilters } from "./matches";

describe("summarizeFilters", () => {
  it("checks every filter, in the job's order, and counts the met ones", () => {
    const summary = summarizeFilters(["Figma", "English"], ["Mentoring", "Accessibility"], ["English", "Accessibility"]);

    expect(summary).toEqual({
      checked: true,
      required: [
        { label: "Figma", met: false },
        { label: "English", met: true },
      ],
      optional: [
        { label: "Mentoring", met: false },
        { label: "Accessibility", met: true },
      ],
      requiredMet: 1,
      optionalMet: 1,
    });
  });

  it("compares labels case-insensitively", () => {
    expect(summarizeFilters(["React"], [], ["react"]).requiredMet).toBe(1);
  });

  it("ignores matches that are no longer filters of the job", () => {
    const summary = summarizeFilters(["Figma"], [], ["Sketch", "Figma"]);
    expect(summary.required).toEqual([{ label: "Figma", met: true }]);
    expect(summary.requiredMet).toBe(1);
  });

  it("says not checked, with nothing met, when the application hasn't been checked", () => {
    const summary = summarizeFilters(["Figma"], ["Mentoring"], null);
    expect(summary.checked).toBe(false);
    expect(summary.requiredMet).toBe(0);
    expect(summary.optionalMet).toBe(0);
    expect(summary.required).toEqual([{ label: "Figma", met: false }]);
  });

  it("handles a job without filters", () => {
    expect(summarizeFilters([], [], [])).toEqual({
      checked: true,
      required: [],
      optional: [],
      requiredMet: 0,
      optionalMet: 0,
    });
  });
});
