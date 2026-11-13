import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// The token in an invitation email's link (features/interview-invitations.md). 256 random bits, so it
// can't be guessed; only its sha-256 is stored, so a copy of the table can't answer for anyone.

export function generateInviteToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

// In constant time, and false for a token of the wrong shape instead of an error.
export function tokenMatches(token: string, storedHash: Buffer): boolean {
  const hash = hashToken(token);
  return hash.length === storedHash.length && timingSafeEqual(hash, storedHash);
}

// A bytea as PostgREST takes and gives it: "\x" and the hex digits.
export function toPgBytea(buffer: Buffer): string {
  return `\\x${buffer.toString("hex")}`;
}

export function fromPgBytea(value: unknown): Buffer | null {
  if (typeof value !== "string" || !/^\\x[0-9a-f]*$/i.test(value)) return null;
  return Buffer.from(value.slice(2), "hex");
}
