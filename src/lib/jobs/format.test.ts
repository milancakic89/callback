import { describe, expect, it } from "vitest";
import { formatAbsolute, formatRelative } from "./format";

const NOW = Date.parse("2026-10-25T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();

describe("formatRelative", () => {
  it("says 'just now' under a minute", () => {
    expect(formatRelative(ago(30 * 1000), NOW)).toBe("just now");
  });

  it("uses the largest unit that fits", () => {
    expect(formatRelative(ago(2 * HOUR), NOW)).toBe("2 hours ago");
    expect(formatRelative(ago(3 * DAY), NOW)).toBe("3 days ago");
    expect(formatRelative(ago(14 * DAY), NOW)).toBe("2 weeks ago");
    expect(formatRelative(ago(60 * DAY), NOW)).toBe("2 months ago");
  });

  it("uses words for yesterday and last year", () => {
    expect(formatRelative(ago(DAY), NOW)).toBe("yesterday");
    expect(formatRelative(ago(400 * DAY), NOW)).toBe("last year");
  });

  it("also describes the future", () => {
    expect(formatRelative(ahead(2 * HOUR), NOW)).toBe("in 2 hours");
  });

  it("shows a dash for a date it can't read", () => {
    expect(formatRelative("not a date", NOW)).toBe("—");
  });
});

describe("formatAbsolute", () => {
  it("writes day, short month and year", () => {
    expect(formatAbsolute("2026-10-25T09:00:00.000Z", "UTC")).toBe("25 Oct 2026");
  });

  it("takes the day in the zone it is given, so server and browser agree", () => {
    // 23:30 UTC is already the next day in Belgrade (UTC+1 once daylight saving ended on 25 October).
    expect(formatAbsolute("2026-10-25T23:30:00.000Z", "UTC")).toBe("25 Oct 2026");
    expect(formatAbsolute("2026-10-25T23:30:00.000Z", "Europe/Belgrade")).toBe("26 Oct 2026");
  });

  it("says 'Unknown' for a date it can't read", () => {
    expect(formatAbsolute("not a date")).toBe("Unknown");
  });
});
