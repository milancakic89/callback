import { describe, expect, it } from "vitest";
import {
  effectiveStatus,
  interviewRequestSchema,
  isValidTimeZone,
  responseDeadline,
  startProblem,
} from "./schedule";

const HOUR = 3_600_000;
const NOW = new Date("2030-01-10T09:00:00.000Z");
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

describe("responseDeadline", () => {
  it("is 48 hours after sending when the interview is far enough away", () => {
    expect(responseDeadline(NOW, at(24 * 7)).toISOString()).toBe(at(48).toISOString());
  });

  it("is 2 hours before the interview when that comes first", () => {
    expect(responseDeadline(NOW, at(10)).toISOString()).toBe(at(8).toISOString());
  });

  it("leaves a window of an hour for an interview 3 hours away", () => {
    expect(responseDeadline(NOW, at(3)).toISOString()).toBe(at(1).toISOString());
  });
});

describe("startProblem", () => {
  it("allows 3 hours from now up to 90 days", () => {
    expect(startProblem(at(3), NOW)).toBeNull();
    expect(startProblem(at(24), NOW)).toBeNull();
    expect(startProblem(at(90 * 24), NOW)).toBeNull();
  });

  it("says when the time has passed, is too soon or too far", () => {
    expect(startProblem(at(-1), NOW)).toBe("past");
    expect(startProblem(at(2.9), NOW)).toBe("too_soon");
    expect(startProblem(at(0), NOW)).toBe("too_soon");
    expect(startProblem(at(90 * 24 + 1), NOW)).toBe("too_far");
    expect(startProblem(new Date("nope"), NOW)).toBe("past");
  });
});

describe("effectiveStatus", () => {
  it("reads a pending invitation past its deadline as expired", () => {
    expect(effectiveStatus("pending", at(-1), NOW)).toBe("expired");
    expect(effectiveStatus("pending", NOW.toISOString(), NOW)).toBe("expired");
    expect(effectiveStatus("pending", at(1), NOW)).toBe("pending");
  });

  it("leaves every other status as it is", () => {
    for (const status of ["confirmed", "declined", "expired", "cancelled"] as const) {
      expect(effectiveStatus(status, at(-100), NOW)).toBe(status);
    }
  });
});

describe("isValidTimeZone", () => {
  it("knows real zones", () => {
    expect(isValidTimeZone("Europe/Belgrade")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("interviewRequestSchema", () => {
  const valid = {
    applicationId: "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f",
    startsAt: "2030-01-15T10:00:00.000Z",
    durationMinutes: 45,
    timeZone: "Europe/Belgrade",
  };

  it("takes a request and trims the message", () => {
    const parsed = interviewRequestSchema.parse({ ...valid, message: "  Hello\r\nthere  " });
    expect(parsed).toEqual({ ...valid, message: "Hello\nthere" });
  });

  it("takes a request with no message and an offset instead of Z", () => {
    expect(interviewRequestSchema.safeParse(valid).success).toBe(true);
    expect(interviewRequestSchema.safeParse({ ...valid, startsAt: "2030-01-15T11:00:00+01:00" }).success).toBe(true);
  });

  it("refuses each field that is wrong", () => {
    const bad: Record<string, unknown> = {
      applicationId: "nope",
      startsAt: "tomorrow",
      durationMinutes: 50,
      timeZone: "Mars/Olympus",
      message: "x".repeat(1001),
    };
    for (const [field, value] of Object.entries(bad)) {
      expect(interviewRequestSchema.safeParse({ ...valid, [field]: value }).success, field).toBe(false);
    }
  });

  it("offers the four lengths and no other", () => {
    for (const durationMinutes of [30, 45, 60, 90]) {
      expect(interviewRequestSchema.safeParse({ ...valid, durationMinutes }).success, String(durationMinutes)).toBe(true);
    }
    for (const durationMinutes of [0, 15, 120, 45.5, "45"]) {
      expect(interviewRequestSchema.safeParse({ ...valid, durationMinutes }).success, String(durationMinutes)).toBe(false);
    }
  });
});
