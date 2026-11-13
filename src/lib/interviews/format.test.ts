import { describe, expect, it } from "vitest";
import { formatDeadline, formatDuration, formatInterviewTime } from "./format";

describe("formatInterviewTime", () => {
  it("reads the instant in the zone it was chosen in, with the zone's name", () => {
    // 10:00 UTC is 11:00 in Belgrade in January and 05:00 in New York.
    expect(formatInterviewTime("2030-01-15T10:00:00.000Z", "Europe/Belgrade")).toBe("Tuesday, 15 January 2030, 11:00 (Europe/Belgrade)");
    expect(formatInterviewTime("2030-01-15T10:00:00.000Z", "America/New_York")).toBe("Tuesday, 15 January 2030, 05:00 (America/New_York)");
  });

  it("moves to the right day across midnight", () => {
    expect(formatInterviewTime(new Date("2030-01-15T23:30:00.000Z"), "Europe/Belgrade")).toContain("Wednesday, 16 January 2030, 00:30");
  });

  it("uses the summer offset in summer", () => {
    expect(formatInterviewTime("2030-07-16T10:00:00.000Z", "Europe/Belgrade")).toContain("12:00");
  });
});

describe("formatDuration", () => {
  it("reads minutes and hours", () => {
    expect(formatDuration(30)).toBe("30 minutes");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(90)).toBe("1 hour 30 minutes");
    expect(formatDuration(120)).toBe("2 hours");
    expect(formatDuration(61)).toBe("1 hour 1 minute");
  });
});

describe("formatDeadline", () => {
  it("gives the day and the time in the zone", () => {
    expect(formatDeadline("2030-01-17T10:00:00.000Z", "Europe/Belgrade")).toBe("17 Jan, 11:00");
  });
});
