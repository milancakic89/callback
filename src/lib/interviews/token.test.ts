import { describe, expect, it } from "vitest";
import { fromPgBytea, generateInviteToken, hashToken, tokenMatches, toPgBytea } from "./token";

describe("generateInviteToken", () => {
  it("makes a long url-safe token and the hash of it", () => {
    const { token, hash } = generateInviteToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toEqual(hashToken(token));
    expect(hash).toHaveLength(32);
  });

  it("never makes the same token twice", () => {
    expect(generateInviteToken().token).not.toBe(generateInviteToken().token);
  });
});

describe("tokenMatches", () => {
  it("accepts the token the hash was made from, and nothing else", () => {
    const { token, hash } = generateInviteToken();

    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches(`${token}x`, hash)).toBe(false);
    expect(tokenMatches(generateInviteToken().token, hash)).toBe(false);
    expect(tokenMatches("", hash)).toBe(false);
  });

  it("is false, not an error, for a stored hash of the wrong length", () => {
    expect(tokenMatches("anything", Buffer.from("short"))).toBe(false);
  });
});

describe("bytea", () => {
  it("goes to the database and comes back as the same bytes", () => {
    const { hash } = generateInviteToken();
    const sent = toPgBytea(hash);

    expect(sent).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(fromPgBytea(sent)).toEqual(hash);
  });

  it("refuses anything that isn't hex", () => {
    for (const value of [null, undefined, 5, "abcd", "\\xzz", "x\\x00"]) {
      expect(fromPgBytea(value), String(value)).toBeNull();
    }
  });
});
