import { NextResponse, type NextRequest } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const GLOBAL_LIMIT = 300;
const GLOBAL_WINDOW_MS = 60_000;

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
