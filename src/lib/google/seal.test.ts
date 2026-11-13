import { describe, expect, it } from "vitest";
import { openToken, sealToken } from "./seal";

const KEY = "k".repeat(40);

describe("sealToken and openToken", () => {
  it("gives the token back to whoever has the key", () => {
    const sealed = sealToken("1//refresh-token", KEY);
    expect(openToken(sealed, KEY)).toBe("1//refresh-token");
  });

  it("does not show the token, and seals the same token differently each time", () => {
    const first = sealToken("1//refresh-token", KEY);
    expect(first).not.toContain("refresh-token");
    expect(sealToken("1//refresh-token", KEY)).not.toBe(first);
  });

  it("refuses a wrong key", () => {
    expect(openToken(sealToken("1//refresh-token", KEY), "j".repeat(40))).toBeNull();
  });

  it("refuses a value that was changed, cut short or never sealed", () => {
    const [iv, tag, sealed] = sealToken("1//refresh-token", KEY).split(".");
    const flipped = `${sealed.slice(0, -2)}${sealed.endsWith("AA") ? "BB" : "AA"}`;
    expect(openToken([iv, tag, flipped].join("."), KEY)).toBeNull();
    expect(openToken([iv, tag].join("."), KEY)).toBeNull();
    expect(openToken("1//refresh-token", KEY)).toBeNull();
    expect(openToken("", KEY)).toBeNull();
  });
});
