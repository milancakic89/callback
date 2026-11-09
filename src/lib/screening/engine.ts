// The seam between the app and whatever reads a CV against a job's filters (features/cv-screening.md).
// Everything else (applying, the re-check, the database columns, the review screen) only knows the
// types below, so a different engine, such as a real ATS or an LLM behind an API, replaces the
// keyword engine by changing one line in index.ts. No `server-only`: the types and the column mapping
// are plain, and the tests use them.

// What an engine says about one filter. "unverified" is not "missing": it is a filter an engine can't
// decide from the CV (a quantity such as "5+ years"), which the reviewer checks by eye.
export type FilterVerdict = "met" | "missing" | "unverified";

export type ScreeningOutcome =
  // `verdicts` has one entry for each filter of the job, keyed by the job's own label.
  | { kind: "checked"; verdicts: Record<string, FilterVerdict> }
  // The CV couldn't be read as text (a scan, a damaged file): nothing was checked.
  | { kind: "unreadable" };

export type ScreeningFilters = { required: readonly string[]; optional: readonly string[] };

export type ScreeningCv = { bytes: Uint8Array; fileName: string };

export interface ScreeningEngine {
  // Stored with each result, so results can be told apart (and redone) when the engine changes.
  readonly id: string;
  screen(cv: ScreeningCv, filters: ScreeningFilters): Promise<ScreeningOutcome>;
}

// The columns of public.job_applications an outcome becomes (supabase/migrations/20261109140000_cv_screening.sql).
export type ScreeningColumns = {
  matched_filters: string[] | null;
  unverified_filters: string[] | null;
  screening_outcome: "checked" | "unreadable";
  screened_at: string;
  screening_engine: string;
};

// The job's labels in the job's order, so the stored lists read the way the form shows them.
export function toScreeningColumns(
  outcome: ScreeningOutcome,
  engineId: string,
  filters: ScreeningFilters,
  now: Date,
): ScreeningColumns {
  const base = { screened_at: now.toISOString(), screening_engine: engineId };
  if (outcome.kind === "unreadable") {
    return { ...base, matched_filters: null, unverified_filters: null, screening_outcome: "unreadable" };
  }
  const labels = [...filters.required, ...filters.optional];
  const labelsWith = (verdict: FilterVerdict) => labels.filter((label) => outcome.verdicts[label] === verdict);
  return {
    ...base,
    matched_filters: labelsWith("met"),
    unverified_filters: labelsWith("unverified"),
    screening_outcome: "checked",
  };
}
