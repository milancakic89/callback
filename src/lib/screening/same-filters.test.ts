import { describe, expect, it } from "vitest";
import { sameFilters } from "./same-filters";

describe("sameFilters", () => {
  it("is true for the same labels in the same lists, in any order", () => {
    expect(sameFilters({ required: ["A", "B"], optional: ["C"] }, { required: ["B", "A"], optional: ["C"] })).toBe(true);
    expect(sameFilters({ required: [], optional: [] }, { required: [], optional: [] })).toBe(true);
  });

  it("is false when a filter is added, removed or spelled differently", () => {
    expect(sameFilters({ required: ["A"], optional: [] }, { required: ["A", "B"], optional: [] })).toBe(false);
    expect(sameFilters({ required: ["A", "B"], optional: [] }, { required: ["A"], optional: [] })).toBe(false);
    expect(sameFilters({ required: ["React"], optional: [] }, { required: ["react"], optional: [] })).toBe(false);
  });

  it("is false when a filter moves between required and nice-to-have", () => {
    expect(sameFilters({ required: ["A"], optional: ["B"] }, { required: ["A", "B"], optional: [] })).toBe(false);
    expect(sameFilters({ required: ["A"], optional: ["B"] }, { required: ["B"], optional: ["A"] })).toBe(false);
  });

  it("does not confuse labels that join into the same text", () => {
    expect(sameFilters({ required: ["A B"], optional: [] }, { required: ["A", "B"], optional: [] })).toBe(false);
  });
});
