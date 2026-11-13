import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { googleRedirectUri, googleSettings, ownCompanyId, saveGoogleConnection } from "@/lib/google/connection";
import { exchangeCode, GOOGLE_STATE_COOKIE } from "@/lib/google/oauth";

function sameState(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Where Google sends the employer back (features/interview-invitations.md). It only stores a connection
// for the signed-in employer's own company, after the `state` matched the cookie /api/google/connect
// set. Whatever happens, the employer lands on their settings with a flag that says how it went.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.accountType !== "employer" || !user.companySlug) {
    return NextResponse.redirect(new URL("/sign-in", env.APP_URL));
  }
  const back = (flag: string) => {
    const response = NextResponse.redirect(new URL(`/${user.companySlug}/settings?google=${flag}`, env.APP_URL));
    response.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/google" });
    return response;
  };

  const params = request.nextUrl.searchParams;
  if (!sameState(params.get("state"), request.cookies.get(GOOGLE_STATE_COOKIE)?.value)) return back("error");
  // The employer said no on Google's screen.
  if (params.get("error")) return back("denied");

  const code = params.get("code");
  const settings = googleSettings();
  if (!code || !settings) return back("error");

  try {
    const companyId = await ownCompanyId();
    if (!companyId) return back("error");
    const tokens = await exchangeCode(settings.client, googleRedirectUri(), code);
    await saveGoogleConnection({ companyId, userId: user.id, email: tokens.email, refreshToken: tokens.refreshToken });
  } catch (error) {
    console.error("Google callback failed:", error);
    return back("error");
  }
  return back("connected");
}
