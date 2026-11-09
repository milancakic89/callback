import { describe, expect, it } from "vitest";
import { summarizeFilters, type ScreeningResult } from "./matches";
import { orderApplicants } from "./order";

const REQUIRED = ["Figma", "English", "Design systems"];
const OPTIONAL = ["Mentoring", "Accessibility"];

const result = (matched: string[]): ScreeningResult => ({ matched, unverified: [], outcome: "checked" });
const NOT_CHECKED: ScreeningResult = { matched: null, unverified: null, outcome: null };
const UNREADABLE: ScreeningResult = { matched: null, unverified: null, outcome: "unreadable" };

const applicants = [
  { id: "ana", name: "Ana" }, // applied first
  { id: "jonas", name: "Jonas" },
  { id: "priya", name: "Priya" },
  { id: "luka", name: "Luka" },
  { id: "mia", name: "Mia" },
];

const summaries = new Map([
  ["ana", summarizeFilters(REQUIRED, OPTIONAL, result(["Figma"]))], // 1 required
  ["jonas", summarizeFilters(REQUIRED, OPTIONAL, NOT_CHECKED)],
  ["priya", summarizeFilters(REQUIRED, OPTIONAL, result(["Figma", "English", "Mentoring"]))], // 2 + 1
  ["luka", summarizeFilters(REQUIRED, OPTIONAL, UNREADABLE)],
  ["mia", summarizeFilters(REQUIRED, OPTIONAL, result(["Figma", "English"]))], // 2 + 0
]);

const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe("orderApplicants", () => {
  it("keeps the order the applications came in", () => {
    expect(ids(orderApplicants(applicants, summaries, "applied"))).toEqual(["ana", "jonas", "priya", "luka", "mia"]);
  });

  it("puts the most required filters met first, then the most nice-to-have, and the unchecked and unreadable last", () => {
    expect(ids(orderApplicants(applicants, summaries, "match"))).toEqual(["priya", "mia", "ana", "jonas", "luka"]);
  });

  it("keeps ties in the order they came in", () => {
    const tied = [
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ];
    const same = new Map(tied.map((t) => [t.id, summarizeFilters(REQUIRED, OPTIONAL, result(["Figma"]))]));
    expect(ids(orderApplicants(tied, same, "match"))).toEqual(["a", "b", "c"]);

    const notChecked = new Map(tied.map((t) => [t.id, summarizeFilters(REQUIRED, OPTIONAL, NOT_CHECKED)]));
    expect(ids(orderApplicants(tied, notChecked, "match"))).toEqual(["a", "b", "c"]);
  });

  it("returns every applicant exactly once, and leaves the list it was given alone", () => {
    const original = [...applicants];
    const ordered = orderApplicants(applicants, summaries, "match");
    expect(ordered).toHaveLength(applicants.length);
    expect(new Set(ids(ordered)).size).toBe(applicants.length);
    expect(applicants).toEqual(original);
    expect(orderApplicants(applicants, summaries, "applied")).not.toBe(applicants);
  });

  it("treats an applicant with no summary as not checked", () => {
    expect(ids(orderApplicants([{ id: "x" }, ...applicants], summaries, "match")).at(-1)).toBe("luka");
    expect(ids(orderApplicants([{ id: "x" }, ...applicants], summaries, "match")).indexOf("x")).toBeGreaterThan(2);
  });

  it("is empty for no applicants", () => {
    expect(orderApplicants([], new Map(), "match")).toEqual([]);
  });
});
