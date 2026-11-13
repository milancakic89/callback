import { describe, expect, it } from "vitest";
import { latestInterview, type InterviewRow } from "./latest";

const NOW = new Date("2030-01-10T09:00:00.000Z");

const row = (fields: Partial<InterviewRow> = {}): InterviewRow => ({
  id: "inv-1",
  status: "pending",
  starts_at: "2030-01-15T10:00:00.000Z",
  duration_minutes: 45,
  time_zone: "Europe/Belgrade",
  expires_at: "2030-01-12T09:00:00.000Z",
  responded_at: null,
  meet_url: "https://meet.google.com/abc",
  created_at: "2030-01-10T08:00:00.000Z",
  ...fields,
});

describe("latestInterview", () => {
  it("is null with no invitations", () => {
    expect(latestInterview([], NOW)).toBeNull();
  });

  it("maps a row to what the screen shows", () => {
    expect(latestInterview([row()], NOW)).toEqual({
      id: "inv-1",
      status: "pending",
      startsAt: "2030-01-15T10:00:00.000Z",
      durationMinutes: 45,
      timeZone: "Europe/Belgrade",
      expiresAt: "2030-01-12T09:00:00.000Z",
      respondedAt: null,
      meetUrl: "https://meet.google.com/abc",
    });
  });

  it("takes the newest one", () => {
    const older = row({ id: "old", status: "declined", created_at: "2030-01-05T08:00:00.000Z" });
    expect(latestInterview([older, row()], NOW)?.id).toBe("inv-1");
    expect(latestInterview([row(), older], NOW)?.id).toBe("inv-1");
  });

  it("ignores a cancelled invitation, as if it had not been sent", () => {
    const cancelled = row({ id: "gone", status: "cancelled", created_at: "2030-01-10T08:30:00.000Z" });
    expect(latestInterview([row(), cancelled], NOW)?.id).toBe("inv-1");
    expect(latestInterview([cancelled], NOW)).toBeNull();
  });

  it("reads a pending invitation past its deadline as expired", () => {
    expect(latestInterview([row({ expires_at: "2030-01-10T08:59:00.000Z" })], NOW)?.status).toBe("expired");
  });

  it("ignores a status it doesn't know", () => {
    expect(latestInterview([row({ status: "mystery" })], NOW)).toBeNull();
  });
});
