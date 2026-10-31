// The screening overview on the review screen (features/applicant-review.md): which of the job's
// filters an application's CV meets. Nothing is decided from it; it only informs the reviewer.
// `matched` is null until the application has been checked (real matching comes later).

export type FilterCheck = { label: string; met: boolean };

export type FilterSummary = {
  checked: boolean;
  required: FilterCheck[];
  optional: FilterCheck[];
  requiredMet: number;
  optionalMet: number;
};

// Labels are unique per job case-insensitively (job_filters_valid), so they compare that way.
export function summarizeFilters(
  required: readonly string[],
  optional: readonly string[],
  matched: readonly string[] | null,
): FilterSummary {
  const met = new Set((matched ?? []).map((label) => label.toLowerCase()));
  const check = (label: string): FilterCheck => ({ label, met: met.has(label.toLowerCase()) });
  const requiredChecks = required.map(check);
  const optionalChecks = optional.map(check);

  return {
    checked: matched !== null,
    required: requiredChecks,
    optional: optionalChecks,
    requiredMet: requiredChecks.filter((filter) => filter.met).length,
    optionalMet: optionalChecks.filter((filter) => filter.met).length,
  };
}
