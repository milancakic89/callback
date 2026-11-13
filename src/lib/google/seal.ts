import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Encrypts a Google refresh token for google_calendar_connections (features/interview-invitations.md):
// AES-256-GCM, the key derived from GOOGLE_TOKEN_KEY, in the same iv.tag.sealed shape as the pending
// sign-up cookie (src/lib/auth/pending-signup.ts). The key is a parameter so this has no environment
// in it and can be tested. Authenticated, so a changed value or a wrong key is refused, not misread.

function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function sealToken(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const sealed = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), sealed].map((part) => part.toString("base64url")).join(".");
}

// The token, or null for anything that isn't a value sealed with this key.
export function openToken(value: string, secret: string): string | null {
  try {
    const [iv, tag, sealed] = value.split(".").map((part) => Buffer.from(part, "base64url"));
    if (!iv || !tag || !sealed) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(sealed), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
