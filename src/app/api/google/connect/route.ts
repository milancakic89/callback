import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { googleRedirectUri, googleSettings } from "@/lib/google/connection";
import { buildAuthUrl, GOOGLE_STATE_COOKIE } from "@/lib/google/oauth";

// "Connect Google Calendar" on the company's settings (features/interview-invitations.md): sends the
// employer to Google's consent screen. It is a link, not a form: the CSP's `form-action 'self'` would
// block a form that ends at Google. `state` is a random value kept in a cookie and checked when Google
// sends them back, so the callback can't be started by someone else's link. Redirects are built from
// APP_URL, as in /auth/confirm, because behind the reverse proxy the request only knows localhost.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.accountType !== "employer" || !user.companySlug) {
    return NextResponse.redirect(new URL("/sign-in", env.APP_URL));
  }
  const settingsUrl = (flag: string) => new URL(`/${user.companySlug}/settings?google=${flag}`, env.APP_URL);

  const settings = googleSettings();
  if (!settings) return NextResponse.redirect(settingsUrl("not_configured"));

  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(
    buildAuthUrl({ clientId: settings.client.clientId, redirectUri: googleRedirectUri(), state }),
  );
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax: the cookie has to come back on Google's redirect, a top-level navigation from another site.
    sameSite: "lax",
    path: "/api/google",
    maxAge: 10 * 60,
  });
  return response;
}
