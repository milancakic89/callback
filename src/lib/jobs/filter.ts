// Pure, client-safe filter engine — no React here. See features/dashboard.md "Filter model".
import {
  isWorkMode,
  operatorNeedsValues,
  type FilterField,
  type FilterRule,
  type TextField,
} from "./filter-schema";
import { jobDate, type JobListItem, type WorkMode } from "./types";

// Lowercase, no diacritics, no hyphens, collapsed whitespace. Applied to both job text and typed
// filter/search values, so "front-end" and "frontend" compare equal, and "Čačak" matches "cacak".
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/-/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Bounded by non-letter/non-digit on both sides (Unicode-aware, not ASCII \b), so "java" doesn't
// match "javascript" but "cacak" matches the normalized form of "Čačak".
function wordRegExp(rawValue: string): RegExp | null {
  const value = normalizeText(rawValue);
  if (!value) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(value)}(?![\\p{L}\\p{N}])`, "u");
}

export type NormalizedJob = {
  job: JobListItem;
  title: string;
  company: string;
  location: string;
  department: string;
  // "" both for "no description text" and "not loaded yet" — callers gate on load status
  // themselves (see features/dashboard.md "Description loading") before trusting this.
  description: string;
};

export function buildIndex(
  jobs: JobListItem[],
  descriptions: Record<string, string> | null,
): NormalizedJob[] {
  return jobs.map((job) => ({
    job,
    title: normalizeText(job.title),
    company: normalizeText(job.companyName),
    location: normalizeText(job.locationRaw ?? ""),
    department: normalizeText(job.department ?? ""),
    description: normalizeText(descriptions?.[job.id] ?? ""),
  }));
}

function fieldText(nj: NormalizedJob, field: TextField): string {
  switch (field) {
    case "title":
      return nj.title;
    case "company":
      return nj.company;
    case "location":
      return nj.location;
    case "department":
      return nj.department;
    case "description":
      return nj.description;
  }
}

// True once a rule actually constrains results: value-requiring operators need a non-empty
// value first (features/dashboard.md "A rule with no values is inactive").
export function rulesUseField(rules: FilterRule[], field: FilterField): boolean {
  return rules.some(
    (rule) =>
      rule.field === field &&
      (!operatorNeedsValues(rule.operator) || rule.values.some((value) => value.trim())),
  );
}

type CompiledRule = (nj: NormalizedJob, appliedIds: Set<string> | null) => boolean;

function compileTextRule(rule: FilterRule, field: TextField): CompiledRule | null {
  if (rule.operator === "is_empty" || rule.operator === "is_not_empty") {
    const wantEmpty = rule.operator === "is_empty";
    return (nj) => (fieldText(nj, field).length === 0) === wantEmpty;
  }
  const regexes = rule.values.map(wordRegExp).filter((re): re is RegExp => re !== null);
  if (regexes.length === 0) return null;
  if (rule.operator === "contains_any") {
    return (nj) => regexes.some((re) => re.test(fieldText(nj, field)));
  }
  if (rule.operator === "contains_all") {
    return (nj) => regexes.every((re) => re.test(fieldText(nj, field)));
  }
  if (rule.operator === "contains_none") {
    return (nj) => !regexes.some((re) => re.test(fieldText(nj, field)));
  }
  return null;
}

function compileWorkModeRule(rule: FilterRule): CompiledRule | null {
  if (rule.operator === "is_unknown") {
    return (nj) => nj.job.workMode === null;
  }
  const modes = new Set<WorkMode>(rule.values.filter(isWorkMode));
  if (modes.size === 0) return null;
  if (rule.operator === "is_any") {
    return (nj) => nj.job.workMode !== null && modes.has(nj.job.workMode);
  }
  if (rule.operator === "is_none") {
    return (nj) => nj.job.workMode === null || !modes.has(nj.job.workMode);
  }
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function compilePostedRule(rule: FilterRule): CompiledRule | null {
  if (rule.operator === "in_last_days") {
    const days = Number(rule.values[0]);
    if (!Number.isFinite(days) || days <= 0) return null;
    const cutoff = Date.now() - days * DAY_MS;
    return (nj) => {
      const t = Date.parse(jobDate(nj.job));
      return Number.isFinite(t) && t >= cutoff;
    };
  }
  if (rule.operator === "before" || rule.operator === "after") {
    const bound = Date.parse(rule.values[0] ?? "");
    if (!Number.isFinite(bound)) return null;
    const before = rule.operator === "before";
    return (nj) => {
      const t = Date.parse(jobDate(nj.job));
      return Number.isFinite(t) && (before ? t < bound : t > bound);
    };
  }
  return null;
}

function compileAppliedRule(rule: FilterRule): CompiledRule {
  const wantApplied = rule.operator === "is_applied";
  return (nj, appliedIds) => (appliedIds?.has(nj.job.id) ?? false) === wantApplied;
}

export type CompileOptions = {
  showApplied: boolean;
  // False while descriptions haven't loaded, or failed to — a Description rule is skipped rather
  // than matching against empty text (features/dashboard.md "the other rules keep working").
  includeDescription: boolean;
};

function compileRule(rule: FilterRule, options: CompileOptions): CompiledRule | null {
  switch (rule.field) {
    case "description":
      return options.includeDescription ? compileTextRule(rule, rule.field) : null;
    case "title":
    case "company":
    case "location":
    case "department":
      return compileTextRule(rule, rule.field);
    case "workMode":
      return compileWorkModeRule(rule);
    case "posted":
      return compilePostedRule(rule);
    case "applied":
      // Opened on "/jobs" there's no Applied column to filter by — ignore rather than hide every job.
      return options.showApplied ? compileAppliedRule(rule) : null;
    default:
      return null;
  }
}

export function compileRules(rules: FilterRule[], options: CompileOptions): CompiledRule[] {
  return rules.map((rule) => compileRule(rule, options)).filter((r): r is CompiledRule => r !== null);
}

export function matchesRules(
  nj: NormalizedJob,
  compiled: CompiledRule[],
  appliedIds: Set<string> | null,
): boolean {
  return compiled.every((rule) => rule(nj, appliedIds));
}

// Search is separate from the rules: a substring match over title + company, every typed word
// required but in any order. No whole-word requirement here — it's meant to be fast and loose
// while typing live, unlike the rule builder.
export function matchesSearch(nj: NormalizedJob, query: string): boolean {
  const words = normalizeText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${nj.title} ${nj.company}`;
  return words.every((word) => haystack.includes(word));
}

export type SortField = "title" | "company" | "posted" | "workMode";
export type SortDirection = "asc" | "desc";

const WORK_MODE_ORDER: Record<WorkMode, number> = { REMOTE: 0, HYBRID: 1, ON_SITE: 2 };

function compareJobs(a: JobListItem, b: JobListItem, field: SortField): number {
  switch (field) {
    case "title":
      return a.title.localeCompare(b.title);
    case "company":
      return a.companyName.localeCompare(b.companyName);
    case "workMode":
      return (
        (a.workMode ? WORK_MODE_ORDER[a.workMode] : 3) - (b.workMode ? WORK_MODE_ORDER[b.workMode] : 3)
      );
    case "posted":
      return Date.parse(jobDate(a)) - Date.parse(jobDate(b));
  }
}

export function sortJobs(jobs: JobListItem[], field: SortField, direction: SortDirection): JobListItem[] {
  const sorted = [...jobs].sort((a, b) => compareJobs(a, b, field));
  if (direction === "desc") sorted.reverse();
  return sorted;
}
