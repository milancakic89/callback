import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { homeFor, parseAccountType } from "@/lib/auth/account-type";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const confirmSchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum(["email", "signup", "recovery", "email_change"]),
  next: z.string().optional(),
});

// Only same-origin paths: "//host" and "/\host" are protocol-relative URLs in browsers. Without a
// usable `next`, the user lands on the home for their account type.
function safeNext(next: string | undefined, fallback: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}

// Built from APP_URL, the public address (the same one the email link was made from), and not from
// `request.url`: behind the reverse proxy the Node server only knows it listens on localhost:3000, so
// a redirect built from the request would send the browser there once the link is clicked.
function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, env.APP_URL));
}

export async function GET(request: NextRequest) {
  const parsed = confirmSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));

  if (parsed.success) {
    const { token_hash, type, next } = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: type as EmailOtpType });
    if (!error) {
      const home = homeFor(parseAccountType(data.user?.app_metadata.account_type));
      return redirectTo(safeNext(next, home));
    }
  }

  return redirectTo("/sign-in?error=invalid_link");
}
