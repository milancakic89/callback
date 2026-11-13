import { describe, expect, it } from "vitest";
import { draftProblem, draftStart, draftToRequest, emptyScheduleDraft, type ScheduleDraft } from "./schedule-form";

const ZONE = "Europe/Belgrade";
const APPLICATION_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";

// The inputs give local wall-clock time, so the test builds "now" the same way and does not depend on the
// machine's zone.
const NOW = new Date("2030-01-10T09:00");
const draft = (fields: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  ...emptyScheduleDraft(),
  date: "2030-01-15",
  time: "10:30",
  ...fields,
});

describe("emptyScheduleDraft", () => {
  it("starts on, at 45 minutes, with no day chosen", () => {
    expect(emptyScheduleDraft()).toEqual({ send: true, date: "", time: "10:00", durationMinutes: 45, message: "" });
  });
});

describe("draftStart", () => {
  it("reads the date and time as the browser's own local time", () => {
    expect(draftStart(draft())?.getTime()).toBe(new Date("2030-01-15T10:30").getTime());
  });

  it("is null while either is missing or malformed", () => {
    expect(draftStart(draft({ date: "" }))).toBeNull();
    expect(draftStart(draft({ time: "" }))).toBeNull();
    expect(draftStart(draft({ date: "15.01.2030" }))).toBeNull();
  });
});

describe("draftProblem", () => {
  it("has nothing to say about a draft that won't send", () => {
    expect(draftProblem(draft({ send: false, date: "" }), NOW)).toBeNull();
  });

  it("asks for a day and a time", () => {
    expect(draftProblem(draft({ date: "" }), NOW)).toBe("Choose a date and a time.");
  });

  it("says what is wrong with the time", () => {
    expect(draftProblem(draft({ date: "2030-01-09" }), NOW)).toBe("Choose a time in the future.");
    expect(draftProblem(draft({ date: "2030-01-10", time: "11:00" }), NOW)).toContain("at least 3 hours");
    expect(draftProblem(draft({ date: "2031-01-10" }), NOW)).toContain("90 days");
  });

  it("accepts a good time", () => {
    expect(draftProblem(draft(), NOW)).toBeNull();
  });
});

describe("draftToRequest", () => {
  it("makes the request the Server Action takes", () => {
    expect(draftToRequest(draft({ durationMinutes: 60, message: "A short call." }), APPLICATION_ID, ZONE, NOW)).toEqual({
      applicationId: APPLICATION_ID,
      startsAt: new Date("2030-01-15T10:30").toISOString(),
      durationMinutes: 60,
      timeZone: ZONE,
      message: "A short call.",
    });
  });

  it("leaves the message out when it is blank", () => {
    expect(draftToRequest(draft({ message: "  \n " }), APPLICATION_ID, ZONE, NOW)).not.toHaveProperty("message");
  });

  it("is null for a draft that is off or has a problem", () => {
    expect(draftToRequest(draft({ send: false }), APPLICATION_ID, ZONE, NOW)).toBeNull();
    expect(draftToRequest(draft({ date: "" }), APPLICATION_ID, ZONE, NOW)).toBeNull();
    expect(draftToRequest(draft({ date: "2030-01-09" }), APPLICATION_ID, ZONE, NOW)).toBeNull();
  });
});
