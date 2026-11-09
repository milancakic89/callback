import { NextResponse, type NextRequest } from "next/server";
import type { AccountType } from "@/lib/auth/account-type";
import { gateRedirect } from "@/lib/auth/route-gate";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { updateSession } from "@/lib/supabase/proxy";

const GLOBAL_LIMIT = 300;
const GLOBAL_WINDOW_MS = 60_000;

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
  const { response, isAuthenticated, accountType, companySlug } = hasSessionCookie
    ? await updateSession(request)
    : {
        response: NextResponse.next(),
        isAuthenticated: false,
        accountType: "candidate" as AccountType,
        companySlug: null,
      };

  // Optimistic gating only: pages, Server Actions and the DAL re-check auth themselves. The rules
  // (features/account-types.md, features/company-slugs.md) are in gateRedirect().
  const destination = gateRedirect(request.nextUrl.pathname, { isAuthenticated, accountType, companySlug });
  if (destination) return redirectWithCookies(request, destination, response);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
