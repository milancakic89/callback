import type { Company } from "./types";

export type StageOptions = {
  // --company filters: substrings of the Joberty slug.
  only: string[];
  limit: number | null;
  force: boolean;
  browser: boolean;
  concurrency: number;
  signal: AbortSignal;
};

// Companies already done are skipped unless --force or --company asks for them.
export function selectCompanies(
  companies: Company[],
  options: StageOptions,
  isDone: (company: Company) => boolean,
): Company[] {
  const filters = options.only.map((value) => value.toLowerCase());
  const matching = filters.length
    ? companies.filter((company) => filters.some((value) => company.slug.includes(value)))
    : companies;
  const pending = options.force || filters.length ? matching : matching.filter((c) => !isDone(c));
  return options.limit ? pending.slice(0, options.limit) : pending;
}

export function logProgress(stage: string, done: number, total: number, name: string, message: string) {
  console.log(`[${stage} ${done}/${total}] ${name}: ${message}`);
}
