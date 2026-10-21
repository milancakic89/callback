import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const confirmSchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum(["email", "signup", "recovery", "email_change"]),
  next: z.string().optional(),
});

// Only same-origin paths: "//host" and "/\host" are protocol-relative URLs in browsers.
function safeNext(next: string | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/dashboard";
  }
  return next;
}

export async function GET(request: NextRequest) {
  const parsed = confirmSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));

  if (parsed.success) {
    const { token_hash, type, next } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as EmailOtpType });
    if (!error) {
      return NextResponse.redirect(new URL(safeNext(next), request.url));
    }
  }

  return NextResponse.redirect(new URL("/sign-in?error=invalid_link", request.url));
}
