// The two kinds of account (features/account-types.md): a candidate looks for work and uses the
// job board, saved jobs and applications; an employer posts jobs and has a workspace under their
// company's slug (features/companies.md). Stored in the user's app_metadata.account_type. No
// `server-only`: proxy, Server Components and the choice dialog all use it.
import { companyHome, TEST_COMPANY } from "@/lib/companies/company";

export const ACCOUNT_TYPES = ["candidate", "employer"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// Missing or unknown means candidate: accounts from before account types (and JWTs issued before
// the backfill) are job seekers, and the candidate side is the one with less access.
export function parseAccountType(value: unknown): AccountType {
  return value === "employer" ? "employer" : "candidate";
}

// Every employer belongs to the fixture company until accounts are tied to a `companies` row.
export function homeFor(type: AccountType): string {
  return type === "employer" ? companyHome(TEST_COMPANY) : "/dashboard";
}
