import { NextResponse, type NextRequest } from "next/server";
import { homeFor, type AccountType } from "@/lib/auth/account-type";
import { companyHome, TEST_COMPANY } from "@/lib/companies/company";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { updateSession } from "@/lib/supabase/proxy";

const GLOBAL_LIMIT = 300;
const GLOBAL_WINDOW_MS = 60_000;

const CANDIDATE_PREFIXES = ["/dashboard", "/saved-jobs", "/applications"];
// The employer workspace is the company's slug (features/companies.md). Only the fixture company
// exists, so only its slug is gated; any other first segment is a 404 from the page itself.
const EMPLOYER_PREFIXES = [companyHome(TEST_COMPANY)];
const PROTECTED_PREFIXES = [...CANDIDATE_PREFIXES, ...EMPLOYER_PREFIXES, "/reset-password"];
const GUEST_ONLY_PATHS = ["/sign-in", "/sign-up", "/forgot-password"];
// "/" is the landing page (features/landing.md) and "/jobs" the public job list
// (features/dashboard.md); a signed-in visitor goes straight to their own home: /dashboard (the same
// table plus the Applied column) for a candidate, the company workspace for an employer.
const SIGNED_IN_REDIRECT_PATHS = ["/", "/jobs"];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// Copies refreshed session cookies so a redirect doesn't drop a rotated refresh token.
function redirectWithCookies(request: NextRequest, pathname: string, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(pathname, request.url));
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export async function proxy(request: NextRequest) {
  const { success, resetAt } = await rateLimit({
    key: `global:${getClientIp(request.headers)}`,
    limit: GLOBAL_LIMIT,
    windowMs: GLOBAL_WINDOW_MS,
  });

  if (!success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    });
  }

  // Skip the Supabase client entirely for visitors without a session cookie.
  const hasSessionCookie = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
  const { response, isAuthenticated, accountType } = hasSessionCookie
    ? await updateSession(request)
    : { response: NextResponse.next(), isAuthenticated: false, accountType: "candidate" as AccountType };

  // Optimistic gating only: pages, Server Actions and the DAL re-check auth themselves.
  const { pathname } = request.nextUrl;
  if (!isAuthenticated && PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return redirectWithCookies(request, "/sign-in", response);
  }
  if (
    isAuthenticated &&
    [...GUEST_ONLY_PATHS, ...SIGNED_IN_REDIRECT_PATHS].some((path) => matchesPrefix(pathname, path))
  ) {
    return redirectWithCookies(request, homeFor(accountType), response);
  }
  // Each account type has its own side of the app (features/account-types.md). Pages and Server
  // Actions enforce this with requireAccountType(); this only saves the round trip.
  const otherSide = accountType === "employer" ? CANDIDATE_PREFIXES : EMPLOYER_PREFIXES;
  if (isAuthenticated && otherSide.some((prefix) => matchesPrefix(pathname, prefix))) {
    return redirectWithCookies(request, homeFor(accountType), response);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
