import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  accessTokenFor: vi.fn(),
  addAttendee: vi.fn(),
  deleteEvent: vi.fn(),
  sendInterviewResponseEmail: vi.fn(),
  getUserById: vi.fn(),
  load: vi.fn(),
  update: vi.fn(),
  updateSelect: vi.fn(),
  // The filters of the conditional update, in order: [method, column, value].
  filters: [] as [string, string, unknown][],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://callback.rs" } }));
vi.mock("@/lib/google/connection", () => ({ accessTokenFor: m.accessTokenFor }));
vi.mock("@/lib/google/calendar", () => ({ addAttendee: m.addAttendee, deleteEvent: m.deleteEvent }));
vi.mock("@/lib/mail", () => ({ sendInterviewResponseEmail: m.sendInterviewResponseEmail }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    auth: { admin: { getUserById: m.getUserById } },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: m.load }) }),
      update: (values: unknown) => {
        m.update(values);
        const chain = {
          eq: (column: string, value: unknown) => (m.filters.push(["eq", column, value]), chain),
          gt: (column: string, value: unknown) => (m.filters.push(["gt", column, value]), chain),
          select: m.updateSelect,
        };
        return chain;
      },
    }),
  },
}));

import { answerInvitation, loadInvitationView, type Proof } from "./respond";
import { generateInviteToken, toPgBytea } from "./token";

const INVITATION_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const { token, hash } = generateInviteToken();
const TOKEN: Proof = { kind: "token", token };

const row = (fields: Record<string, unknown> = {}, application: Record<string, unknown> = {}) => ({
  id: INVITATION_ID,
  status: "pending",
  starts_at: "2030-01-15T10:00:00.000Z",
  duration_minutes: 45,
  time_zone: "Europe/Belgrade",
  message: "A short call.",
  expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
  token_hash: toPgBytea(hash),
  google_event_id: "evt-1",
  meet_url: "https://meet.google.com/abc-defg-hij",
  company_id: "company-1",
  application: {
    id: "app-1",
    job_posting_id: "job-1",
    candidate_id: "cand-1",
    withdrawn_at: null,
    candidate: { full_name: "Ana Novak" },
    job: { title: "Product Designer", company: { name: "Acme", slug: "acme", owner_id: "owner-1" } },
    ...application,
  },
  ...fields,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.filters.length = 0;
  m.load.mockResolvedValue({ data: row(), error: null });
  m.updateSelect.mockResolvedValue({ data: [{ id: INVITATION_ID }], error: null });
  m.accessTokenFor.mockResolvedValue("access-token");
  m.addAttendee.mockResolvedValue(undefined);
  m.deleteEvent.mockResolvedValue(undefined);
  m.sendInterviewResponseEmail.mockResolvedValue(undefined);
  m.getUserById.mockImplementation(async (id: string) => ({
    data: { user: { email: id === "owner-1" ? "boss@acme.example" : "ana@example.com" } },
  }));
});

describe("loadInvitationView", () => {
  it("shows the invitation to whoever has the token", async () => {
    expect(await loadInvitationView(INVITATION_ID, TOKEN)).toEqual({
      id: INVITATION_ID,
      state: "pending",
      companyName: "Acme",
      jobTitle: "Product Designer",
      startsAt: "2030-01-15T10:00:00.000Z",
      durationMinutes: 45,
      timeZone: "Europe/Belgrade",
      message: "A short call.",
      expiresAt: expect.any(String),
      meetUrl: null,
    });
  });

  it("knows nothing for a wrong token, or an id that is nobody's", async () => {
    expect(await loadInvitationView(INVITATION_ID, { kind: "token", token: generateInviteToken().token })).toBeNull();
    m.load.mockResolvedValue({ data: null, error: null });
    expect(await loadInvitationView(INVITATION_ID, TOKEN)).toBeNull();
  });

  it("gives the Meet link only once it is confirmed", async () => {
    m.load.mockResolvedValue({ data: row({ status: "confirmed" }), error: null });
    expect((await loadInvitationView(INVITATION_ID, TOKEN))?.meetUrl).toBe("https://meet.google.com/abc-defg-hij");

    m.load.mockResolvedValue({ data: row({ status: "declined" }), error: null });
    expect((await loadInvitationView(INVITATION_ID, TOKEN))?.meetUrl).toBeNull();
  });

  it("reads a pending invitation past its deadline as expired", async () => {
    m.load.mockResolvedValue({ data: row({ expires_at: new Date(Date.now() - 1000).toISOString() }), error: null });
    expect((await loadInvitationView(INVITATION_ID, TOKEN))?.state).toBe("expired");
  });

  it("calls it unavailable once the candidate has withdrawn", async () => {
    m.load.mockResolvedValue({ data: row({}, { withdrawn_at: "2030-01-11T10:00:00.000Z" }), error: null });
    expect((await loadInvitationView(INVITATION_ID, TOKEN))?.state).toBe("unavailable");
  });

  it("lets the signed-in candidate in, and no one else", async () => {
    expect(await loadInvitationView(INVITATION_ID, { kind: "candidate", userId: "cand-1" })).not.toBeNull();
    expect(await loadInvitationView(INVITATION_ID, { kind: "candidate", userId: "someone-else" })).toBeNull();
  });
});

describe("answerInvitation: confirm", () => {
  it("records the answer, makes the candidate a guest and tells the company", async () => {
    const result = await answerInvitation(INVITATION_ID, "confirm", TOKEN);

    expect(result).toMatchObject({ ok: true, response: "confirmed", view: { state: "confirmed", meetUrl: "https://meet.google.com/abc-defg-hij" } });
    expect(m.update).toHaveBeenCalledWith({ status: "confirmed", responded_at: expect.any(String) });
    expect(m.accessTokenFor).toHaveBeenCalledWith("company-1");
    expect(m.addAttendee).toHaveBeenCalledWith("access-token", "evt-1", "ana@example.com");
    expect(m.sendInterviewResponseEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "boss@acme.example",
        candidateName: "Ana Novak",
        response: "confirmed",
        meetUrl: "https://meet.google.com/abc-defg-hij",
        calendarInviteFailed: false,
        reviewUrl: "https://callback.rs/acme/jobs/job-1/review?candidate=app-1",
      }),
    );
  });

  it("keeps the answer when Google can't add the guest, and says so to the company", async () => {
    m.addAttendee.mockRejectedValue(new Error("Google is down"));

    const result = await answerInvitation(INVITATION_ID, "confirm", TOKEN);

    expect(result).toMatchObject({ ok: true, response: "confirmed" });
    expect(m.sendInterviewResponseEmail).toHaveBeenCalledWith(expect.objectContaining({ calendarInviteFailed: true }));
  });

  it("keeps the answer when the company's calendar is gone", async () => {
    m.accessTokenFor.mockRejectedValue(new Error("needs to be connected again"));

    expect(await answerInvitation(INVITATION_ID, "confirm", TOKEN)).toMatchObject({ ok: true });
    expect(m.addAttendee).not.toHaveBeenCalled();
  });

  it("keeps the answer when the email to the company fails", async () => {
    m.sendInterviewResponseEmail.mockRejectedValue(new Error("smtp down"));

    expect(await answerInvitation(INVITATION_ID, "confirm", TOKEN)).toMatchObject({ ok: true });
  });
});

describe("answerInvitation: the update is conditional", () => {
  it("only changes an invitation that is still pending and still before its deadline", async () => {
    const before = Date.now();
    await answerInvitation(INVITATION_ID, "confirm", TOKEN);

    expect(m.filters).toEqual([
      ["eq", "id", INVITATION_ID],
      ["eq", "status", "pending"],
      ["gt", "expires_at", expect.any(String)],
    ]);
    const deadline = new Date(m.filters[2][2] as string).getTime();
    expect(deadline).toBeGreaterThanOrEqual(before);
    expect(deadline).toBeLessThanOrEqual(Date.now());
  });
});

describe("answerInvitation: decline", () => {
  it("records the answer and takes the event out of the calendar without telling anyone", async () => {
    const result = await answerInvitation(INVITATION_ID, "decline", TOKEN);

    expect(result).toMatchObject({ ok: true, response: "declined", view: { state: "declined", meetUrl: null } });
    expect(m.update).toHaveBeenCalledWith({ status: "declined", responded_at: expect.any(String) });
    expect(m.deleteEvent).toHaveBeenCalledWith("access-token", "evt-1", false);
    expect(m.addAttendee).not.toHaveBeenCalled();
    expect(m.sendInterviewResponseEmail).toHaveBeenCalledWith(expect.objectContaining({ response: "declined" }));
  });
});

describe("answerInvitation: who and when", () => {
  it("answers for the signed-in candidate, as for the token", async () => {
    expect(await answerInvitation(INVITATION_ID, "confirm", { kind: "candidate", userId: "cand-1" })).toMatchObject({ ok: true });
  });

  it("changes nothing for a wrong token or another candidate", async () => {
    expect(await answerInvitation(INVITATION_ID, "confirm", { kind: "token", token: generateInviteToken().token })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await answerInvitation(INVITATION_ID, "confirm", { kind: "candidate", userId: "someone-else" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("changes nothing once the invitation is answered, closed or past its deadline", async () => {
    for (const fields of [{ status: "confirmed" }, { status: "declined" }, { status: "cancelled" }, { expires_at: new Date(Date.now() - 1000).toISOString() }]) {
      m.load.mockResolvedValue({ data: row(fields), error: null });
      const result = await answerInvitation(INVITATION_ID, "confirm", TOKEN);
      expect(result, JSON.stringify(fields)).toMatchObject({ ok: false, reason: "closed" });
    }
    expect(m.update).not.toHaveBeenCalled();
    expect(m.addAttendee).not.toHaveBeenCalled();
  });

  it("changes nothing once the candidate has withdrawn", async () => {
    m.load.mockResolvedValue({ data: row({}, { withdrawn_at: "2030-01-11T10:00:00.000Z" }), error: null });

    expect(await answerInvitation(INVITATION_ID, "confirm", TOKEN)).toMatchObject({ ok: false, reason: "closed", view: { state: "unavailable" } });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("loses to an answer or the expiry job that got there first, and does nothing else", async () => {
    m.updateSelect.mockResolvedValue({ data: [], error: null });
    m.load
      .mockResolvedValueOnce({ data: row(), error: null })
      .mockResolvedValueOnce({ data: row({ status: "declined" }), error: null });

    const result = await answerInvitation(INVITATION_ID, "confirm", TOKEN);

    expect(result).toMatchObject({ ok: false, reason: "closed", view: { state: "declined" } });
    expect(m.addAttendee).not.toHaveBeenCalled();
    expect(m.sendInterviewResponseEmail).not.toHaveBeenCalled();
  });

  it("fails loudly when the database does", async () => {
    m.updateSelect.mockResolvedValue({ data: null, error: { message: "db down" } });

    await expect(answerInvitation(INVITATION_ID, "confirm", TOKEN)).rejects.toThrow("db down");
  });
});
