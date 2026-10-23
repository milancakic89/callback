import { NextResponse, type NextRequest } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { updateSession } from "@/lib/supabase/proxy";

const GLOBAL_LIMIT = 300;
const GLOBAL_WINDOW_MS = 60_000;

const PROTECTED_PREFIXES = ["/dashboard", "/applications", "/reset-password"];
const GUEST_ONLY_PATHS = ["/sign-in", "/sign-up", "/forgot-password"];
// "/" is the public job list (features/dashboard.md); a signed-in visitor gets the same table
// plus the Applied column at /dashboard instead.
const SIGNED_IN_REDIRECT_PATHS = ["/"];

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
  const { response, isAuthenticated } = hasSessionCookie
    ? await updateSession(request)
    : { response: NextResponse.next(), isAuthenticated: false };

  // Optimistic gating only: pages, Server Actions and the DAL re-check auth themselves.
  const { pathname } = request.nextUrl;
  if (!isAuthenticated && PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return redirectWithCookies(request, "/sign-in", response);
  }
  if (
    isAuthenticated &&
    [...GUEST_ONLY_PATHS, ...SIGNED_IN_REDIRECT_PATHS].some((path) => matchesPrefix(pathname, path))
  ) {
    return redirectWithCookies(request, "/dashboard", response);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
