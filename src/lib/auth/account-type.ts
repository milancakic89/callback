// The two kinds of account (features/account-types.md): a candidate looks for work and uses the
// job board, saved jobs and applications; an employer posts jobs and has a workspace under their
// company's slug (features/company-slugs.md). Stored in the user's app_metadata.account_type. No
// `server-only`: proxy, Server Components and the choice dialog all use it.
import { companyHome } from "@/lib/companies/company";

export const ACCOUNT_TYPES = ["candidate", "employer"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// Where an employer without a company yet goes to name it and pick an address.
export const SETUP_PATH = "/setup";

// Missing or unknown means candidate: accounts from before account types (and JWTs issued before
// the backfill) are job seekers, and the candidate side is the one with less access.
export function parseAccountType(value: unknown): AccountType {
  return value === "employer" ? "employer" : "candidate";
}

// An employer's home is their company's workspace, /{slug}; until they have set the company up (no
// slug in the JWT yet) it is the setup screen. `companySlug` is app_metadata.company_slug, read with
// parseCompanySlug().
export function homeFor(type: AccountType, companySlug: string | null): string {
  if (type === "candidate") return "/dashboard";
  return companySlug ? companyHome(companySlug) : SETUP_PATH;
}
