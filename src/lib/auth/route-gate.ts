// Who may see which paths (features/account-types.md, features/company-slugs.md), as one pure
// function so proxy stays thin and the rules can be tested. Proxy only redirects optimistically,
// from the JWT; pages and Server Actions re-check with requireAccountType(). No `server-only`:
// proxy runs it.
import { homeFor, SETUP_PATH, type AccountType } from "@/lib/auth/account-type";
import { isLegacyWorkspacePath, isWorkspacePath } from "@/lib/companies/company";

// The candidate side of the app.
const CANDIDATE_PREFIXES = ["/dashboard", "/saved-jobs", "/applications", "/profile"];
const GUEST_ONLY_PREFIXES = ["/sign-in", "/sign-up", "/forgot-password"];
// "/" is the landing page (features/landing.md) and "/jobs" the public job list
// (features/dashboard.md): a signed-in visitor goes straight to their own home. Exact matches:
// /jobs/{id}, a posting, is open to everyone (features/apply-with-cv.md).
const SIGNED_IN_REDIRECT_PATHS = ["/", "/jobs"];

export type Visitor = {
  isAuthenticated: boolean;
  accountType: AccountType;
  // The company address in the JWT; null for a candidate and for an employer who hasn't set up yet.
  companySlug: string | null;
};

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// The path to send the visitor to instead, or null to let the request through.
export function gateRedirect(pathname: string, visitor: Visitor): string | null {
  const isCandidatePath = CANDIDATE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
  // An employer's pages: anything under a company slug, and the screen that makes the slug.
  const isEmployerPath = isWorkspacePath(pathname) || matchesPrefix(pathname, SETUP_PATH);

  if (!visitor.isAuthenticated) {
    const isProtected = isCandidatePath || isEmployerPath || matchesPrefix(pathname, "/reset-password");
    return isProtected ? "/sign-in" : null;
  }

  const { accountType, companySlug } = visitor;
  const home = homeFor(accountType, companySlug);
  if (GUEST_ONLY_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return home;
  if (SIGNED_IN_REDIRECT_PATHS.includes(pathname)) return home;

  // Each account type has its own side of the app.
  if (accountType === "candidate") return isEmployerPath ? home : null;

  if (isCandidatePath || isLegacyWorkspacePath(pathname)) return home;
  // An employer who hasn't set the company up has only the setup screen; one who has doesn't need it.
  if (!companySlug) return isWorkspacePath(pathname) ? SETUP_PATH : null;
  return matchesPrefix(pathname, SETUP_PATH) ? home : null;
}
