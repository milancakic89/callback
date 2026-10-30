import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  DESCRIPTION_MAX,
  FILTER_MAX,
  FILTERS_MAX,
  jobPostingSchema,
  LOCATION_MAX,
  TITLE_MAX,
} from "./job-posting";

const valid = { title: "Senior React Developer", description: "Build things.", location: "", workMode: "" };

function errorsOf(input: Record<string, unknown>) {
  const result = jobPostingSchema.safeParse({ ...valid, ...input });
  if (result.success) throw new Error("expected the input to be refused");
  return Object.keys(z.flattenError(result.error).fieldErrors);
}

describe("jobPostingSchema", () => {
  it("accepts a title and a description, and stores the optional fields as null", () => {
    expect(jobPostingSchema.parse(valid)).toEqual({
      title: "Senior React Developer",
      description: "Build things.",
      location: null,
      workMode: null,
      requiredFilters: [],
      optionalFilters: [],
    });
  });

  it("keeps a location and a work mode", () => {
    expect(jobPostingSchema.parse({ ...valid, location: "Belgrade, Serbia", workMode: "HYBRID" })).toMatchObject({
      location: "Belgrade, Serbia",
      workMode: "HYBRID",
    });
  });

  it("trims the text, and an all-space location is null", () => {
    expect(jobPostingSchema.parse({ ...valid, title: "  Designer  ", location: "   " })).toMatchObject({
      title: "Designer",
      location: null,
    });
  });

  it("requires a title and a description, blank ones included", () => {
    expect(errorsOf({ title: "" })).toEqual(["title"]);
    expect(errorsOf({ title: "   " })).toEqual(["title"]);
    expect(errorsOf({ description: "\n  \n" })).toEqual(["description"]);
  });

  it("limits the lengths", () => {
    expect(jobPostingSchema.safeParse({ ...valid, title: "a".repeat(TITLE_MAX) }).success).toBe(true);
    expect(errorsOf({ title: "a".repeat(TITLE_MAX + 1) })).toEqual(["title"]);
    expect(jobPostingSchema.safeParse({ ...valid, description: "a".repeat(DESCRIPTION_MAX) }).success).toBe(true);
    expect(errorsOf({ description: "a".repeat(DESCRIPTION_MAX + 1) })).toEqual(["description"]);
    expect(jobPostingSchema.safeParse({ ...valid, location: "a".repeat(LOCATION_MAX) }).success).toBe(true);
    expect(errorsOf({ location: "a".repeat(LOCATION_MAX + 1) })).toEqual(["location"]);
  });

  it("counts a CRLF line break as one character and stores it as one", () => {
    const lines = "a\r\n".repeat(DESCRIPTION_MAX / 2 - 1) + "a";
    const parsed = jobPostingSchema.parse({ ...valid, description: lines });
    expect(parsed.description).not.toContain("\r");
    expect(parsed.description.length).toBe(DESCRIPTION_MAX / 2 - 1 + DESCRIPTION_MAX / 2);
  });

  it("refuses a work mode that isn't one of the three", () => {
    for (const workMode of ["remote", "ANYWHERE", "NONE", "DROP TABLE"]) {
      expect(errorsOf({ workMode }), workMode).toEqual(["workMode"]);
    }
  });

  describe("filters", () => {
    const filters = (count: number, prefix: string) => Array.from({ length: count }, (_, i) => `${prefix}${i}`);

    it("are empty lists when the form sends none", () => {
      expect(jobPostingSchema.parse(valid)).toMatchObject({ requiredFilters: [], optionalFilters: [] });
      expect(jobPostingSchema.parse({ ...valid, requiredFilters: [], optionalFilters: [] })).toMatchObject({
        requiredFilters: [],
        optionalFilters: [],
      });
    });

    it("keep both lists, in the order typed", () => {
      expect(
        jobPostingSchema.parse({
          ...valid,
          requiredFilters: ["React", "5+ years"],
          optionalFilters: ["English C1"],
        }),
      ).toMatchObject({ requiredFilters: ["React", "5+ years"], optionalFilters: ["English C1"] });
    });

    it("are trimmed, and blanks are dropped", () => {
      expect(
        jobPostingSchema.parse({ ...valid, requiredFilters: ["  React  ", "", "   ", "\tTypeScript\n"] }),
      ).toMatchObject({ requiredFilters: ["React", "TypeScript"] });
    });

    it("drop a repeat in other letters, keeping the first", () => {
      expect(
        jobPostingSchema.parse({ ...valid, requiredFilters: ["React", "react", "REACT", "Node"] }),
      ).toMatchObject({ requiredFilters: ["React", "Node"] });
    });

    it("limit each one to FILTER_MAX characters", () => {
      expect(jobPostingSchema.safeParse({ ...valid, requiredFilters: ["a".repeat(FILTER_MAX)] }).success).toBe(true);
      expect(errorsOf({ requiredFilters: ["a".repeat(FILTER_MAX + 1)] })).toEqual(["requiredFilters"]);
      expect(errorsOf({ optionalFilters: ["ok", "a".repeat(FILTER_MAX + 1)] })).toEqual(["optionalFilters"]);
    });

    it("limit both lists together to FILTERS_MAX, and blame the required list", () => {
      const required = filters(FILTERS_MAX - 5, "r");
      expect(
        jobPostingSchema.safeParse({ ...valid, requiredFilters: required, optionalFilters: filters(5, "o") }).success,
      ).toBe(true);

      const result = jobPostingSchema.safeParse({
        ...valid,
        requiredFilters: required,
        optionalFilters: filters(6, "o"),
      });
      expect(result.success).toBe(false);
      expect(result.error && z.flattenError(result.error).fieldErrors).toEqual({
        requiredFilters: ["Use at most 20 filters in all."],
      });
    });

    it("count what is kept, not what was typed", () => {
      const typed = [...filters(FILTERS_MAX, "r"), "R0", "", "  "];
      expect(
        jobPostingSchema.parse({ ...valid, requiredFilters: typed }).requiredFilters,
      ).toHaveLength(FILTERS_MAX);
    });

    it("can't repeat one across the lists, case-insensitively, and blame the nice-to-have list", () => {
      const result = jobPostingSchema.safeParse({
        ...valid,
        requiredFilters: ["React"],
        optionalFilters: ["Node", "react"],
      });
      expect(result.success).toBe(false);
      expect(result.error && z.flattenError(result.error).fieldErrors).toEqual({
        optionalFilters: ["“react” is already a required filter."],
      });
    });

    it("are reported together with the other fields", () => {
      expect(errorsOf({ title: "", requiredFilters: ["A"], optionalFilters: ["a"] }).sort()).toEqual([
        "optionalFilters",
        "title",
      ]);
    });
  });
});
