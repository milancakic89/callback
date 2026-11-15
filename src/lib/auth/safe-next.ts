// Where a sign-in or an email link may send the user on to. No `server-only`: the sign-in form checks
// the same rule before it carries the address along.
import { trackNext } from "@/lib/external-jobs/track-query";

// Only same-origin paths: "//host" and "/\host" are protocol-relative URLs in browsers. Without a
// usable `next`, the caller's fallback is used.
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}

// /jobs/{id}: a posting, the one place a visitor is sent to sign in (or sign up) and come back to
// (features/apply-with-cv.md), optionally with its apply dialog open, `?apply=1`
// (features/candidate-cvs.md). Strict about the id's shape, so nothing else gets through: no other
// query, no fragment, no further segments.
const POSTING_PATH = /^\/jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\?apply=1)?$/i;

// A posting's path, or null for anything else.
export function postingNext(next: unknown): string | null {
  return typeof next === "string" && POSTING_PATH.test(next) && safeNext(next, "") === next ? next : null;
}

// Where a candidate may be sent back to after signing in or signing up: a posting (`postingNext`) or the
// page that adds a job from the browser extension (`trackNext`, features/chrome-extension.md). Each is
// strict about its own shape, so nothing else gets through; the result is always a path we made.
export function candidateNext(next: unknown): string | null {
  return postingNext(next) ?? trackNext(next);
}
