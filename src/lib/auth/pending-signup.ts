import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { candidateNext } from "./safe-next";

// Proof, without a session, that whoever sees the account-type dialog owns the account
// (features/account-types.md). It is set only right after sign-up created the account, or after
// sign-in got `email_not_confirmed`, which Supabase answers only to the right password. The
// dialog renders while this cookie exists, so it survives a reload and goes away once a type is
// chosen. `uid: null` is a decoy for an email that is already registered: the dialog looks the
// same and sends nothing, so sign-up still doesn't reveal which emails have accounts. Encrypted,
// not just signed, so the decoy can't be told apart by decoding the cookie.

const COOKIE = "cb_pending_signup";
const MAX_AGE_SECONDS = 60 * 60;
const KEY = createHash("sha256").update(env.AUTH_COOKIE_SECRET).digest();

// `next` is the page a candidate signed up from: a posting (features/candidate-cvs.md) or the page the
// browser extension opens (features/chrome-extension.md), which the activation email brings them back
// to; null for anything else.
export type PendingSignup = { uid: string | null; email: string; next: string | null };

// A browser keeps a cookie of up to about 4 KB, and drops a longer one without a word. The link of the
// extension's page carries a job's title, company and place, which can run long in an accented script,
// so a `next` past this is left out: the candidate lands on their home after activating, not on a
// sign-up that silently loses its dialog.
export const PENDING_NEXT_MAX_LENGTH = 1500;

export async function setPendingSignup(pending: PendingSignup) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const next = pending.next !== null && pending.next.length <= PENDING_NEXT_MAX_LENGTH ? pending.next : null;
  const payload = JSON.stringify({ ...pending, next, exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const sealed = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const value = [iv, cipher.getAuthTag(), sealed].map((part) => part.toString("base64url")).join(".");

  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readPendingSignup(): Promise<PendingSignup | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  // The expiry check reads the clock. Prefetches render the session's App Shell with cookies but not
  // the clock, so the dialog waits for the navigation instead.
  await io();
  try {
    const [iv, tag, sealed] = value.split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const data = JSON.parse(Buffer.concat([decipher.update(sealed), decipher.final()]).toString("utf8"));
    if (typeof data.email !== "string" || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { uid: typeof data.uid === "string" ? data.uid : null, email: data.email, next: candidateNext(data.next) };
  } catch {
    // Tampered, truncated or sealed with an old key.
    return null;
  }
}

export async function clearPendingSignup() {
  (await cookies()).delete(COOKIE);
}
