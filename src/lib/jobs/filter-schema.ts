import { z } from "zod";
import { WORK_MODES } from "./types";

// See features/dashboard.md "Filter model" for the field/operator table this encodes.

export const FILTER_FIELDS = [
  "title",
  "company",
  "description",
  "location",
  "department",
  "workMode",
  "posted",
  "applied",
] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];

export const TEXT_FIELDS = ["title", "company", "description", "location", "department"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

// Fields whose text isn't available until descriptions load — see features/dashboard.md
// "Description loading".
export const LAZY_TEXT_FIELDS = ["description"] as const;

export const TEXT_OPERATORS = ["contains_any", "contains_all", "contains_none"] as const;
export const EMPTINESS_OPERATORS = ["is_empty", "is_not_empty"] as const;
export const WORK_MODE_OPERATORS = ["is_any", "is_none", "is_unknown"] as const;
export const POSTED_OPERATORS = ["in_last_days", "before", "after"] as const;
export const APPLIED_OPERATORS = ["is_applied", "is_not_applied"] as const;

export const OPERATORS_BY_FIELD: Record<FilterField, readonly string[]> = {
  title: TEXT_OPERATORS,
  company: TEXT_OPERATORS,
  description: [...TEXT_OPERATORS, ...EMPTINESS_OPERATORS],
  location: [...TEXT_OPERATORS, ...EMPTINESS_OPERATORS],
  department: [...TEXT_OPERATORS, ...EMPTINESS_OPERATORS],
  workMode: WORK_MODE_OPERATORS,
  posted: POSTED_OPERATORS,
  applied: APPLIED_OPERATORS,
};

export type FilterOperator =
  | (typeof TEXT_OPERATORS)[number]
  | (typeof EMPTINESS_OPERATORS)[number]
  | (typeof WORK_MODE_OPERATORS)[number]
  | (typeof POSTED_OPERATORS)[number]
  | (typeof APPLIED_OPERATORS)[number];

export const FIELD_LABELS: Record<FilterField, string> = {
  title: "Title",
  company: "Company",
  description: "Description",
  location: "Location",
  department: "Department",
  workMode: "Work mode",
  posted: "Posted",
  applied: "Applied",
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains_any: "contains any of",
  contains_all: "contains all of",
  contains_none: "contains none of",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  is_any: "is any of",
  is_none: "is none of",
  is_unknown: "is unknown",
  in_last_days: "in the last N days",
  before: "before",
  after: "after",
  is_applied: "is applied",
  is_not_applied: "is not applied",
};

// Operators that need at least one value before the rule does anything — see
// features/dashboard.md "A rule with no values is inactive."
const VALUE_REQUIRING_OPERATORS: readonly string[] = [
  "contains_any",
  "contains_all",
  "contains_none",
  "is_any",
  "is_none",
  "in_last_days",
  "before",
  "after",
];

export function operatorNeedsValues(operator: string): boolean {
  return VALUE_REQUIRING_OPERATORS.includes(operator);
}

export function defaultOperatorFor(field: FilterField): string {
  return OPERATORS_BY_FIELD[field][0];
}

let ruleIdCounter = 0;
export function newRuleId(): string {
  ruleIdCounter += 1;
  return `r${Date.now().toString(36)}${ruleIdCounter}`;
}

// `field` is a plain string, not `FilterField`, to match the lenient zod schema below: a rule
// decoded from the URL may name a field this version doesn't know. compileRule (filter.ts) treats
// any unrecognized field as inert; isFilterField() narrows it where a strict type is needed.
export type FilterRule = {
  id: string;
  field: string;
  operator: string;
  values: string[];
};

export function emptyRule(field: FilterField): FilterRule {
  return { id: newRuleId(), field, operator: defaultOperatorFor(field), values: [] };
}

const MAX_RULES = 20;
const MAX_VALUES = 20;
const MAX_VALUE_LENGTH = 100;

// Deliberately loose at the schema level (operator is just a non-empty string, not validated
// against OPERATORS_BY_FIELD): an older/newer URL with a field this version doesn't know about
// should still decode instead of discarding every other rule. compileRules treats an
// unrecognized field/operator pair as an always-inactive rule.
const filterRuleSchema = z.object({
  id: z.string().min(1).max(40),
  field: z.string().min(1).max(40),
  operator: z.string().min(1).max(40),
  values: z.array(z.string().max(MAX_VALUE_LENGTH)).max(MAX_VALUES),
});

const filtersFileSchema = z.object({
  v: z.literal(1),
  rules: z.array(filterRuleSchema).max(MAX_RULES),
});

export function isFilterField(value: string): value is FilterField {
  return (FILTER_FIELDS as readonly string[]).includes(value);
}

export function isWorkMode(value: string): value is (typeof WORK_MODES)[number] {
  return (WORK_MODES as readonly string[]).includes(value);
}

// Base64url, so it's safe unescaped in a query string.
export function encodeFilters(rules: FilterRule[]): string | null {
  if (rules.length === 0) return null;
  const json = JSON.stringify({ v: 1, rules });
  const base64 = typeof window === "undefined" ? Buffer.from(json, "utf8").toString("base64") : btoa(json);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Invalid or tampered input is dropped silently (empty list), never thrown — the dashboard loads
// unfiltered instead of erroring on a bad link.
export function decodeFilters(encoded: string | null): FilterRule[] {
  if (!encoded) return [];
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = typeof window === "undefined" ? Buffer.from(padded, "base64").toString("utf8") : atob(padded);
    const parsed = filtersFileSchema.parse(JSON.parse(json));
    return parsed.rules;
  } catch {
    return [];
  }
}
