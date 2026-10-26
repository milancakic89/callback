import { describe, expect, it } from "vitest";
import {
  FILTER_FIELDS,
  OPERATORS_BY_FIELD,
  decodeFilters,
  defaultOperatorFor,
  emptyRule,
  encodeFilters,
  isFilterField,
  isWorkMode,
  operatorNeedsValues,
  type FilterRule,
} from "./filter-schema";

function rule(overrides: Partial<FilterRule> = {}): FilterRule {
  return { id: "r1", field: "title", operator: "contains_any", values: ["react"], ...overrides };
}

// A filter parameter as the browser would put it in a link, built by hand so a test can break it.
function encoded(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

describe("encodeFilters / decodeFilters", () => {
  it("round-trips rules, ids included", () => {
    const rules = [rule(), rule({ id: "r2", field: "workMode", operator: "is_any", values: ["REMOTE", "HYBRID"] })];
    expect(decodeFilters(encodeFilters(rules))).toEqual(rules);
  });

  it("encodes no rules as no parameter at all", () => {
    expect(encodeFilters([])).toBeNull();
  });

  it("produces something safe to put in a query string unescaped", () => {
    expect(encodeFilters([rule({ values: ["a?b/c+d=e&f"] })])).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("keeps non-ASCII text intact", () => {
    const rules = [rule({ values: ["Čačak", "日本語", "🚀"] })];
    expect(decodeFilters(encodeFilters(rules))).toEqual(rules);
  });

  it("treats a missing or empty parameter as no filters", () => {
    expect(decodeFilters(null)).toEqual([]);
    expect(decodeFilters("")).toEqual([]);
  });

  it("drops a link that isn't valid, instead of throwing", () => {
    expect(decodeFilters("!!!")).toEqual([]);
    expect(decodeFilters("not-base64-json")).toEqual([]);
    expect(decodeFilters(encoded({}))).toEqual([]);
    expect(decodeFilters(encoded({ v: 2, rules: [rule()] }))).toEqual([]);
    expect(decodeFilters(encoded({ v: 1, rules: "nope" }))).toEqual([]);
  });

  it("still decodes a rule whose field or operator this version doesn't know", () => {
    const rules = [rule({ field: "salary", operator: "greater_than", values: ["100"] })];
    expect(decodeFilters(encoded({ v: 1, rules }))).toEqual(rules);
  });

  describe("limits on a link someone crafted", () => {
    it("accepts 20 rules and refuses 21", () => {
      const many = (count: number) => Array.from({ length: count }, (_, i) => rule({ id: `r${i}` }));
      expect(decodeFilters(encoded({ v: 1, rules: many(20) }))).toHaveLength(20);
      expect(decodeFilters(encoded({ v: 1, rules: many(21) }))).toEqual([]);
    });

    it("accepts 20 values in a rule and refuses 21", () => {
      const values = (count: number) => Array.from({ length: count }, (_, i) => `v${i}`);
      expect(decodeFilters(encoded({ v: 1, rules: [rule({ values: values(20) })] }))).toHaveLength(1);
      expect(decodeFilters(encoded({ v: 1, rules: [rule({ values: values(21) })] }))).toEqual([]);
    });

    it("accepts a value of 100 characters and refuses 101", () => {
      expect(decodeFilters(encoded({ v: 1, rules: [rule({ values: ["x".repeat(100)] })] }))).toHaveLength(1);
      expect(decodeFilters(encoded({ v: 1, rules: [rule({ values: ["x".repeat(101)] })] }))).toEqual([]);
    });

    it("refuses a rule without an id, field or operator", () => {
      expect(decodeFilters(encoded({ v: 1, rules: [rule({ id: "" })] }))).toEqual([]);
      expect(decodeFilters(encoded({ v: 1, rules: [rule({ field: "" })] }))).toEqual([]);
      expect(decodeFilters(encoded({ v: 1, rules: [rule({ operator: "" })] }))).toEqual([]);
    });
  });
});

describe("operators", () => {
  it("tells which ones do nothing until they have a value", () => {
    for (const operator of ["contains_any", "contains_all", "contains_none", "is_any", "is_none", "in_last_days", "before", "after"]) {
      expect(operatorNeedsValues(operator), operator).toBe(true);
    }
    for (const operator of ["is_empty", "is_not_empty", "is_unknown", "is_applied", "is_not_applied"]) {
      expect(operatorNeedsValues(operator), operator).toBe(false);
    }
  });

  it("offers every field at least one operator, and starts on the first", () => {
    for (const field of FILTER_FIELDS) {
      expect(OPERATORS_BY_FIELD[field].length, field).toBeGreaterThan(0);
      expect(defaultOperatorFor(field)).toBe(OPERATORS_BY_FIELD[field][0]);
    }
    expect(defaultOperatorFor("title")).toBe("contains_any");
    expect(defaultOperatorFor("workMode")).toBe("is_any");
    expect(defaultOperatorFor("posted")).toBe("in_last_days");
    expect(defaultOperatorFor("applied")).toBe("is_applied");
  });
});

describe("emptyRule", () => {
  it("starts with the field's default operator and no values", () => {
    expect(emptyRule("location")).toMatchObject({ field: "location", operator: "contains_any", values: [] });
  });

  it("gives every new rule its own id", () => {
    const ids = new Set(Array.from({ length: 50 }, () => emptyRule("title").id));
    expect(ids.size).toBe(50);
  });
});

describe("type guards", () => {
  it("recognise the fields and work modes this version knows", () => {
    expect(isFilterField("title")).toBe(true);
    expect(isFilterField("salary")).toBe(false);
    expect(isWorkMode("REMOTE")).toBe(true);
    expect(isWorkMode("remote")).toBe(false);
  });
});
