import { describe, expect, it } from "vitest";
import { screeningStatus, summarizeFilters, type ScreeningResult } from "./matches";

const checked = (matched: string[], unverified: string[] = []): ScreeningResult => ({
  matched,
  unverified,
  outcome: "checked",
});
const NOT_CHECKED: ScreeningResult = { matched: null, unverified: null, outcome: null };
const UNREADABLE: ScreeningResult = { matched: null, unverified: null, outcome: "unreadable" };

describe("summarizeFilters", () => {
  it("checks every filter, in the job's order, and counts the met ones", () => {
    const summary = summarizeFilters(["Figma", "English"], ["Mentoring", "Accessibility"], checked(["English", "Accessibility"]));

    expect(summary).toEqual({
      status: "checked",
      required: [
        { label: "Figma", state: "missing" },
        { label: "English", state: "met" },
      ],
      optional: [
        { label: "Mentoring", state: "missing" },
        { label: "Accessibility", state: "met" },
      ],
      requiredMet: 1,
      optionalMet: 1,
      requiredUnverified: 0,
      optionalUnverified: 0,
    });
  });

  it("leaves a filter the check couldn't decide to the reviewer, and counts it as neither met nor missing", () => {
    const summary = summarizeFilters(["Figma", "5+ years"], ["English C1"], checked(["Figma"], ["5+ years", "English C1"]));

    expect(summary.required).toEqual([
      { label: "Figma", state: "met" },
      { label: "5+ years", state: "unverified" },
    ]);
    expect(summary.optional).toEqual([{ label: "English C1", state: "unverified" }]);
    expect(summary.requiredMet).toBe(1);
    expect(summary.requiredUnverified).toBe(1);
    expect(summary.optionalUnverified).toBe(1);
  });

  it("compares labels case-insensitively", () => {
    expect(summarizeFilters(["React"], [], checked(["react"])).requiredMet).toBe(1);
    expect(summarizeFilters(["5+ Years"], [], checked([], ["5+ years"])).required[0].state).toBe("unverified");
  });

  it("ignores results that are no longer filters of the job", () => {
    const summary = summarizeFilters(["Figma"], [], checked(["Sketch", "Figma"]));
    expect(summary.required).toEqual([{ label: "Figma", state: "met" }]);
    expect(summary.requiredMet).toBe(1);
  });

  it("shows a filter added after the check as missing, not as met", () => {
    expect(summarizeFilters(["Figma", "Rust"], [], checked(["Figma"])).required[1].state).toBe("missing");
  });

  it("says not checked, with nothing met, when the application hasn't been checked", () => {
    const summary = summarizeFilters(["Figma"], ["Mentoring"], NOT_CHECKED);
    expect(summary.status).toBe("unchecked");
    expect(summary.requiredMet).toBe(0);
    expect(summary.optionalMet).toBe(0);
    expect(summary.required).toEqual([{ label: "Figma", state: "unverified" }]);
  });

  it("says unreadable, with nothing met, when the CV had no text to read", () => {
    const summary = summarizeFilters(["Figma"], ["Mentoring"], UNREADABLE);
    expect(summary.status).toBe("unreadable");
    expect(summary.requiredMet + summary.optionalMet).toBe(0);
    expect(summary.required).toEqual([{ label: "Figma", state: "unverified" }]);
    // Nothing was decided, so there is no count of filters left over from a check.
    expect(summary.requiredUnverified + summary.optionalUnverified).toBe(0);
  });

  it("handles a job without filters", () => {
    expect(summarizeFilters([], [], checked([]))).toEqual({
      status: "checked",
      required: [],
      optional: [],
      requiredMet: 0,
      optionalMet: 0,
      requiredUnverified: 0,
      optionalUnverified: 0,
    });
  });
});

describe("screeningStatus", () => {
  it("reads the demo job's hand-written matches, which have no outcome, as checked", () => {
    expect(screeningStatus({ matched: ["Figma"], unverified: null, outcome: null })).toBe("checked");
  });

  it("tells the three apart", () => {
    expect(screeningStatus(NOT_CHECKED)).toBe("unchecked");
    expect(screeningStatus(UNREADABLE)).toBe("unreadable");
    expect(screeningStatus(checked([]))).toBe("checked");
  });

  it("says unreadable even if matches were left behind", () => {
    expect(screeningStatus({ matched: ["Figma"], unverified: null, outcome: "unreadable" })).toBe("unreadable");
  });
});
