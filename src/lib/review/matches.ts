// The screening overview on the review screen (features/applicant-review.md, features/cv-screening.md):
// which of the job's filters an application's CV meets. Nothing is decided from it; it only informs the
// reviewer, who reads the CV and decides.

export type FilterState = "met" | "missing" | "unverified";

export type FilterCheck = { label: string; state: FilterState };

// "unchecked": nothing has been saved for the application (yet). "unreadable": the CV had no text to
// read (a scan, a damaged file). "checked": the CV was read and every filter has an answer.
export type ScreeningStatus = "unchecked" | "unreadable" | "checked";

export type FilterSummary = {
  status: ScreeningStatus;
  required: FilterCheck[];
  optional: FilterCheck[];
  requiredMet: number;
  optionalMet: number;
  // The filters a keyword check can't decide ("5+ years"): the reviewer reads the CV for them.
  requiredUnverified: number;
  optionalUnverified: number;
};

// What is saved on an application (public.job_applications). A row with matches and no outcome is
// read as checked: the demo job's hand-written matches look like that.
export type ScreeningResult = {
  matched: readonly string[] | null;
  unverified: readonly string[] | null;
  outcome: "checked" | "unreadable" | null;
};

export function screeningStatus(result: ScreeningResult): ScreeningStatus {
  if (result.outcome === "unreadable") return "unreadable";
  return result.matched === null ? "unchecked" : "checked";
}

// Labels are unique per job case-insensitively (job_filters_valid), so they compare that way. Until an
// application is checked, every filter is left to the reviewer ("unverified"), and none counts as met.
export function summarizeFilters(
  required: readonly string[],
  optional: readonly string[],
  result: ScreeningResult,
): FilterSummary {
  const status = screeningStatus(result);
  const met = new Set((result.matched ?? []).map((label) => label.toLowerCase()));
  const unverified = new Set((result.unverified ?? []).map((label) => label.toLowerCase()));
  const check = (label: string): FilterCheck => {
    const key = label.toLowerCase();
    if (status !== "checked") return { label, state: "unverified" };
    return { label, state: met.has(key) ? "met" : unverified.has(key) ? "unverified" : "missing" };
  };
  const requiredChecks = required.map(check);
  const optionalChecks = optional.map(check);
  const count = (checks: FilterCheck[], state: FilterState) => checks.filter((c) => c.state === state).length;

  return {
    status,
    required: requiredChecks,
    optional: optionalChecks,
    requiredMet: count(requiredChecks, "met"),
    optionalMet: count(optionalChecks, "met"),
    // Only a checked CV has filters left to the reviewer because of what they say; the others have all.
    requiredUnverified: status === "checked" ? count(requiredChecks, "unverified") : 0,
    optionalUnverified: status === "checked" ? count(optionalChecks, "unverified") : 0,
  };
}
