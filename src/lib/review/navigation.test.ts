import { describe, expect, it } from "vitest";
import { initialIndex, nextUnviewed } from "./navigation";

const list = (...viewed: boolean[]) => viewed.map((v, i) => ({ id: `a${i}`, viewed: v }));

describe("nextUnviewed", () => {
  it("goes to the next applicant not viewed yet, skipping viewed ones", () => {
    expect(nextUnviewed(list(false, false, false), 0)).toBe(1);
    expect(nextUnviewed(list(false, true, true, false), 0)).toBe(3);
  });

  it("wraps round to the top", () => {
    expect(nextUnviewed(list(false, true, false), 2)).toBe(0);
    expect(nextUnviewed(list(true, false, true, true), 2)).toBe(1);
  });

  it("never stays on the applicant Next was pressed on, even before its mark lands", () => {
    expect(nextUnviewed(list(false, true, true), 0)).toBeNull();
    expect(nextUnviewed(list(false), 0)).toBeNull();
  });

  it("answers null when everyone has been viewed", () => {
    expect(nextUnviewed(list(true, true, true), 1)).toBeNull();
    expect(nextUnviewed([], 0)).toBeNull();
  });
});

describe("initialIndex", () => {
  it("opens the applicant the URL names", () => {
    expect(initialIndex(list(false, false, true), "a2")).toBe(2);
  });

  it("ignores an unknown id and opens the first one not viewed", () => {
    expect(initialIndex(list(true, false, false), "nope")).toBe(1);
    expect(initialIndex(list(true, true, false), null)).toBe(2);
  });

  it("opens the first one when everyone has been viewed", () => {
    expect(initialIndex(list(true, true))).toBe(0);
  });
});
