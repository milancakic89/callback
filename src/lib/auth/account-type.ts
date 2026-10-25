// The two kinds of account (features/account-types.md): a candidate looks for work and uses the
// job board, saved jobs and applications; an employer posts jobs and has its own area under
// /employer. Stored in the user's app_metadata.account_type. No `server-only`: proxy, Server
// Components and the choice dialog all use it.

export const ACCOUNT_TYPES = ["candidate", "employer"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// Missing or unknown means candidate: accounts from before account types (and JWTs issued before
// the backfill) are job seekers, and the candidate side is the one with less access.
export function parseAccountType(value: unknown): AccountType {
  return value === "employer" ? "employer" : "candidate";
}

export function homeFor(type: AccountType): string {
  return type === "employer" ? "/employer" : "/dashboard";
}
