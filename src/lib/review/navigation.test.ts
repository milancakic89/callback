import { describe, expect, it } from "vitest";
import { initialIndex, matchesPlaylist, nextTarget, nextUnviewed, previousTarget } from "./navigation";

const list = (...viewed: boolean[]) => viewed.map((v, i) => ({ id: `a${i}`, viewed: v }));
const all = () => true;
// Viewed and liked, per applicant: "v" viewed, "l" liked, "vl" both, "" neither.
const marked = (...marks: string[]) =>
  marks.map((m, i) => ({ id: `a${i}`, viewed: m.includes("v"), liked: m.includes("l") }));
const liked = (item: { liked: boolean }) => item.liked;

describe("matchesPlaylist", () => {
  const ana = { liked: true, stage: "INTERVIEW" } as const;
  const jonas = { liked: false, stage: "REJECTED" } as const;

  it("shows everyone in All with any status", () => {
    expect(matchesPlaylist(ana, "all", "any")).toBe(true);
    expect(matchesPlaylist(jonas, "all", "any")).toBe(true);
  });

  it("narrows by the heart and by the status", () => {
    expect(matchesPlaylist(ana, "liked", "any")).toBe(true);
    expect(matchesPlaylist(jonas, "liked", "any")).toBe(false);
    expect(matchesPlaylist(jonas, "all", "REJECTED")).toBe(true);
    expect(matchesPlaylist(ana, "all", "REJECTED")).toBe(false);
  });

  it("needs both when both are set", () => {
    expect(matchesPlaylist(ana, "liked", "INTERVIEW")).toBe(true);
    expect(matchesPlaylist(ana, "liked", "OFFER")).toBe(false);
    expect(matchesPlaylist(jonas, "liked", "REJECTED")).toBe(false);
  });

  it("gives Next and ← the same list when used as their filter", () => {
    const items = [
      { id: "a", viewed: true, liked: false, stage: "REJECTED" },
      { id: "b", viewed: true, liked: false, stage: "INTERVIEW" },
      { id: "c", viewed: true, liked: true, stage: "REJECTED" },
      { id: "d", viewed: true, liked: false, stage: "INTERVIEW" },
    ] as const;
    const interview = (item: (typeof items)[number]) => matchesPlaylist(item, "all", "INTERVIEW");

    expect(nextTarget(items, 1, interview)).toBe(3);
    expect(nextTarget(items, 3, interview)).toBeNull();
    expect(previousTarget(items, 3, interview)).toBe(1);
  });
});

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

describe("nextTarget", () => {
  it("goes to the next applicant not viewed yet, like nextUnviewed", () => {
    expect(nextTarget(list(false, true, false), 0, all)).toBe(2);
    expect(nextTarget(list(false, true, false), 2, all)).toBe(0);
  });

  it("ends the first pass on the last new applicant, wherever it is in the list", () => {
    expect(nextTarget(list(true, false, true), 1, all)).toBeNull();
    expect(nextTarget(list(false), 0, all)).toBeNull();
  });

  it("goes down the list in order once everyone is viewed, and ends at the bottom", () => {
    expect(nextTarget(list(true, true, true), 0, all)).toBe(1);
    expect(nextTarget(list(true, true, true), 1, all)).toBe(2);
    expect(nextTarget(list(true, true, true), 2, all)).toBeNull();
  });

  it("goes through the liked ones only when the playlist shows those", () => {
    const items = marked("vl", "v", "vl", "v", "vl");
    expect(nextTarget(items, 0, liked)).toBe(2);
    expect(nextTarget(items, 2, liked)).toBe(4);
    expect(nextTarget(items, 4, liked)).toBeNull();
    expect(nextTarget(items, 1, liked)).toBe(2);
  });

  it("goes through everyone again in All, from wherever the liked pass left off", () => {
    expect(nextTarget(marked("vl", "v", "vl", "v"), 2, all)).toBe(3);
  });

  it("still opens a new applicant first in Liked, and nothing when none is liked", () => {
    expect(nextTarget(marked("vl", "v", "l", "vl"), 0, liked)).toBe(2);
    expect(nextTarget(marked("v", "v"), 0, liked)).toBeNull();
    expect(nextTarget([], 0, all)).toBeNull();
  });
});

describe("previousTarget", () => {
  it("goes to the one above, wrapping round to the bottom", () => {
    expect(previousTarget(list(true, true, true), 1, all)).toBe(0);
    expect(previousTarget(list(true, true, true), 0, all)).toBe(2);
  });

  it("skips the ones the playlist doesn't show", () => {
    const items = marked("vl", "v", "vl", "v");
    expect(previousTarget(items, 2, liked)).toBe(0);
    expect(previousTarget(items, 0, liked)).toBe(2);
    expect(previousTarget(items, 3, liked)).toBe(2);
  });

  it("answers null when there is no other one", () => {
    expect(previousTarget(list(true), 0, all)).toBeNull();
    expect(previousTarget(marked("vl", "v"), 0, liked)).toBeNull();
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
