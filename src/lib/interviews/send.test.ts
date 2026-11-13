import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  hit: vi.fn(),
  ownCompanyId: vi.fn(),
  accessTokenFor: vi.fn(),
  createInterviewEvent: vi.fn(),
  deleteEvent: vi.fn(),
  sendInterviewInvitationEmail: vi.fn(),
  cancelInvitation: vi.fn(),
  getUserById: vi.fn(),
  adminUpdateEq: vi.fn(),
  rpc: vi.fn(),
  results: {} as Record<string, { data: unknown; error: unknown }>,
  // The real class is in a module that needs the environment, so the test has its own.
  GoogleUnavailableError: class extends Error {},
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://callback.rs" } }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit: m.hit } }));
vi.mock("@/lib/google/connection", () => ({
  ownCompanyId: m.ownCompanyId,
  accessTokenFor: m.accessTokenFor,
  GoogleUnavailableError: m.GoogleUnavailableError,
}));
vi.mock("@/lib/google/calendar", () => ({ createInterviewEvent: m.createInterviewEvent, deleteEvent: m.deleteEvent }));
vi.mock("@/lib/mail", () => ({ sendInterviewInvitationEmail: m.sendInterviewInvitationEmail }));
vi.mock("./cancel", () => ({ cancelInvitation: m.cancelInvitation }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    auth: { admin: { getUserById: m.getUserById } },
    from: () => ({ update: () => ({ eq: m.adminUpdateEq }) }),
  },
}));
// The employer's own client: any chain of filters ends in the table's canned answer.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: m.rpc,
    from: (table: string) => {
      const chain: object = new Proxy({}, { get: (_, method) => (method === "maybeSingle" ? () => Promise.resolve(m.results[table]) : () => chain) });
      return chain;
    },
  }),
}));

import { sendInterviewInvitation, sendInterviewInvitations } from "./send";
import { hashToken, toPgBytea } from "./token";

const APPLICATION_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";
const INVITATION_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const DEADLINE = "2030-01-13T09:00:00.000Z";

// Far enough ahead that it never becomes "too soon" while the suite runs.
const request = {
  applicationId: APPLICATION_ID,
  startsAt: new Date(Date.now() + 10 * 24 * 3_600_000).toISOString(),
  durationMinutes: 45,
  timeZone: "Europe/Belgrade",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  m.ownCompanyId.mockResolvedValue("company-1");
  m.accessTokenFor.mockResolvedValue("access-token");
  m.createInterviewEvent.mockResolvedValue({ eventId: "evt-1", meetUrl: "https://meet.google.com/abc-defg-hij" });
  m.deleteEvent.mockResolvedValue(undefined);
  m.sendInterviewInvitationEmail.mockResolvedValue(undefined);
  m.cancelInvitation.mockResolvedValue({ ok: true, calendarCleaned: true });
  m.getUserById.mockResolvedValue({ data: { user: { email: "ana@example.com" } } });
  m.adminUpdateEq.mockResolvedValue({ error: null });
  m.results.job_applications = {
    data: { id: APPLICATION_ID, job_posting_id: "job-1", candidate_id: "cand-1", candidate: { full_name: "Ana Novak" }, job: { title: "Product Designer" } },
    error: null,
  };
  m.results.companies = { data: { name: "Acme", slug: "acme" }, error: null };
  m.results.interview_invitations = { data: null, error: null };
  m.rpc.mockImplementation((name: string) =>
    name === "create_interview_invitation"
      ? { single: () => Promise.resolve({ data: { invitation_id: INVITATION_ID, deadline: DEADLINE }, error: null }) }
      : Promise.resolve({ error: null }),
  );
});

const failure = (error: string) => ({ applicationId: APPLICATION_ID, ok: false, error });
const rpcNames = () => m.rpc.mock.calls.map(([name]) => name);

describe("sendInterviewInvitation", () => {
  it("creates the row, the Meet event and the email, and answers the invitation", async () => {
    const outcome = await sendInterviewInvitation("user-1", { ...request, message: "A short call." });

    expect(outcome).toEqual({
      applicationId: APPLICATION_ID,
      ok: true,
      interview: {
        id: INVITATION_ID,
        status: "pending",
        startsAt: request.startsAt,
        durationMinutes: 45,
        timeZone: "Europe/Belgrade",
        expiresAt: DEADLINE,
        respondedAt: null,
        meetUrl: "https://meet.google.com/abc-defg-hij",
      },
    });
    expect(m.createInterviewEvent).toHaveBeenCalledWith(
      "access-token",
      expect.objectContaining({
        summary: "Interview: Ana Novak (Product Designer)",
        durationMinutes: 45,
        timeZone: "Europe/Belgrade",
        requestId: INVITATION_ID,
      }),
    );
  });

  it("keeps only the hash of the token in the database, and the token itself in the email's link", async () => {
    await sendInterviewInvitation("user-1", request);

    const [name, args] = m.rpc.mock.calls[0];
    expect(name).toBe("create_interview_invitation");
    const link = new URL(m.sendInterviewInvitationEmail.mock.calls[0][0].url);
    expect(link.origin + link.pathname).toBe(`https://callback.rs/interviews/${INVITATION_ID}`);
    const token = link.searchParams.get("t")!;
    expect(token).toHaveLength(43);
    expect(args.p_token_hash).toBe(toPgBytea(hashToken(token)));
    expect(JSON.stringify(args)).not.toContain(token);
  });

  it("writes the event's id and link onto the invitation, and tells the candidate", async () => {
    await sendInterviewInvitation("user-1", { ...request, message: "A short call." });

    expect(m.adminUpdateEq).toHaveBeenCalledWith("id", INVITATION_ID);
    expect(m.sendInterviewInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@example.com",
        candidateName: "Ana Novak",
        companyName: "Acme",
        jobTitle: "Product Designer",
        duration: "45 minutes",
        message: "A short call.",
      }),
    );
  });

  it("refuses a time that is too soon before anything else runs", async () => {
    const soon = { ...request, startsAt: new Date(Date.now() + 3_600_000).toISOString() };

    expect(await sendInterviewInvitation("user-1", soon)).toEqual(failure("Choose a time at least 3 hours from now, so the candidate has time to answer."));
    expect(m.hit).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("is limited to 30 an hour", async () => {
    await sendInterviewInvitation("user-1", request);
    expect(m.hit).toHaveBeenCalledWith("interview-invite:user-1", 60 * 60_000);

    m.hit.mockResolvedValue({ count: 31, resetAt: Date.now() + 60_000 });
    m.rpc.mockClear();
    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("Too many invitations. Try again in an hour."));
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("writes nothing when Google isn't connected", async () => {
    m.accessTokenFor.mockRejectedValue(new m.GoogleUnavailableError("Connect Google Calendar in Settings first."));

    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("Connect Google Calendar in Settings first."));
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.createInterviewEvent).not.toHaveBeenCalled();
  });

  it("says when the caller has no company or the application isn't theirs", async () => {
    m.ownCompanyId.mockResolvedValue(null);
    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("Set up your company first."));

    m.ownCompanyId.mockResolvedValue("company-1");
    m.results.job_applications = { data: null, error: null };
    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("That application isn't available for an invitation."));
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("explains what the database refused", async () => {
    const refuse = (message: string, code?: string) =>
      m.rpc.mockImplementation(() => ({ single: () => Promise.resolve({ data: null, error: { message, code } }) }));

    refuse("not_interview_step", "P0001");
    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("Move the candidate to an interview step and apply the status first."));
    refuse("application_not_found", "P0002");
    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("That application isn't available for an invitation."));
    refuse("duplicate key", "23505");
    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("An invitation is already open for this candidate. Cancel it first."));
    refuse("secret detail", "XX000");
    const unknown = await sendInterviewInvitation("user-1", request);
    expect(unknown).toEqual(failure("Could not create the invitation. Try again."));
    expect(JSON.stringify(unknown)).not.toContain("secret");
    expect(m.createInterviewEvent).not.toHaveBeenCalled();
  });

  it("takes the invitation back when the Meet event can't be made", async () => {
    m.createInterviewEvent.mockRejectedValue(new Error("Google is down"));

    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("Could not create the Google Meet event. Try again."));
    expect(rpcNames()).toEqual(["create_interview_invitation", "cancel_interview_invitation"]);
    expect(m.sendInterviewInvitationEmail).not.toHaveBeenCalled();
    expect(m.deleteEvent).not.toHaveBeenCalled();
  });

  it("takes the event and the invitation back when the email can't be sent", async () => {
    m.sendInterviewInvitationEmail.mockRejectedValue(new Error("smtp down"));

    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("Could not send the email to the candidate. Try again."));
    expect(m.deleteEvent).toHaveBeenCalledWith("access-token", "evt-1", false);
    expect(rpcNames()).toEqual(["create_interview_invitation", "cancel_interview_invitation"]);
  });

  it("takes the event and the invitation back when the event can't be attached", async () => {
    m.adminUpdateEq.mockResolvedValue({ error: { message: "db down" } });

    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("Could not create the invitation. Try again."));
    expect(m.deleteEvent).toHaveBeenCalledWith("access-token", "evt-1", false);
    expect(m.sendInterviewInvitationEmail).not.toHaveBeenCalled();
  });

  it("won't open a second invitation while one is waiting or confirmed", async () => {
    m.results.interview_invitations = {
      data: { id: "open-1", status: "pending", expires_at: new Date(Date.now() + 3_600_000).toISOString() },
      error: null,
    };

    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("An invitation is already open for this candidate. Cancel it first."));
    expect(m.cancelInvitation).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("closes an invitation past its deadline first, so a new one can go out", async () => {
    m.results.interview_invitations = {
      data: { id: "stale-1", status: "pending", expires_at: new Date(Date.now() - 3_600_000).toISOString() },
      error: null,
    };

    const outcome = await sendInterviewInvitation("user-1", request);

    expect(m.cancelInvitation).toHaveBeenCalledWith(expect.objectContaining({ rpc: m.rpc }), "stale-1");
    expect(outcome.ok).toBe(true);
  });

  it("says no email to write to when the candidate has none", async () => {
    m.getUserById.mockResolvedValue({ data: { user: { email: undefined } } });

    expect(await sendInterviewInvitation("user-1", request)).toEqual(failure("That candidate has no email address to write to."));
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe("sendInterviewInvitations", () => {
  it("sends one after the other and answers each outcome", async () => {
    const second = { ...request, applicationId: "5f8d3c21-6b7a-4c19-8e42-0a1b2c3d4e5f" };

    const outcomes = await sendInterviewInvitations("user-1", [request, second]);

    expect(outcomes.map((outcome) => outcome.applicationId)).toEqual([request.applicationId, second.applicationId]);
    expect(m.createInterviewEvent).toHaveBeenCalledTimes(2);
  });

  it("answers an empty list with nothing", async () => {
    expect(await sendInterviewInvitations("user-1", [])).toEqual([]);
  });
});
