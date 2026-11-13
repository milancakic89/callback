import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ answerInvitation: vi.fn(), hit: vi.fn(), headers: vi.fn() }));

vi.mock("next/headers", () => ({ headers: m.headers }));
vi.mock("@/lib/interviews/respond", () => ({ answerInvitation: m.answerInvitation }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit: m.hit } }));

import { respondToInterview, type InterviewResponseState } from "./actions";

const INVITATION_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const view = { id: INVITATION_ID, state: "pending", companyName: "Acme" } as never;
const previous: InterviewResponseState = { view };

function form(fields: Partial<Record<"invitationId" | "token" | "response", string>>) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ invitationId: INVITATION_ID, token: "the-token", response: "confirm", ...fields })) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.7" }));
  m.hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
});

describe("respondToInterview", () => {
  it("answers with the token from the form and shows the invitation as it now stands", async () => {
    const answered = { id: INVITATION_ID, state: "confirmed" } as never;
    m.answerInvitation.mockResolvedValue({ ok: true, response: "confirmed", view: answered });

    expect(await respondToInterview(previous, form({}))).toEqual({ view: answered });
    expect(m.answerInvitation).toHaveBeenCalledExactlyOnceWith(INVITATION_ID, "confirm", { kind: "token", token: "the-token" });
  });

  it("passes Decline on", async () => {
    m.answerInvitation.mockResolvedValue({ ok: true, response: "declined", view });

    await respondToInterview(previous, form({ response: "decline" }));
    expect(m.answerInvitation).toHaveBeenCalledWith(INVITATION_ID, "decline", expect.anything());
  });

  it("refuses a form that isn't one of ours, before anything else runs", async () => {
    for (const fields of [{ invitationId: "nope" }, { token: "" }, { token: "x".repeat(101) }, { response: "maybe" }]) {
      const state = await respondToInterview(previous, form(fields));
      expect(state, JSON.stringify(fields)).toEqual({ view, error: "Something went wrong. Reload the page and try again." });
    }
    expect(m.hit).not.toHaveBeenCalled();
    expect(m.answerInvitation).not.toHaveBeenCalled();
  });

  it("shows how the invitation stands when it has closed, without an error", async () => {
    const closed = { id: INVITATION_ID, state: "expired" } as never;
    m.answerInvitation.mockResolvedValue({ ok: false, reason: "closed", view: closed });

    expect(await respondToInterview(previous, form({}))).toEqual({ view: closed });
  });

  it("says a wrong token is no longer valid, without saying why", async () => {
    m.answerInvitation.mockResolvedValue({ ok: false, reason: "not_found" });

    expect(await respondToInterview(previous, form({}))).toEqual({ view, error: "This link isn't valid anymore." });
  });

  it("reports a failure without its detail", async () => {
    m.answerInvitation.mockRejectedValue(new Error("secret detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const state = await respondToInterview(previous, form({}));
    expect(state.error).toBe("Could not save your answer. Try again.");
    expect(JSON.stringify(state)).not.toContain("secret");
    log.mockRestore();
  });

  it("is limited by address and by invitation", async () => {
    m.answerInvitation.mockResolvedValue({ ok: true, response: "confirmed", view });
    await respondToInterview(previous, form({}));
    expect(m.hit).toHaveBeenCalledWith("interview-respond:ip:203.0.113.7", 15 * 60_000);
    expect(m.hit).toHaveBeenCalledWith(`interview-respond:${INVITATION_ID}`, 15 * 60_000);

    m.hit.mockResolvedValue({ count: 99, resetAt: Date.now() + 60_000 });
    m.answerInvitation.mockClear();
    expect(await respondToInterview(previous, form({}))).toEqual({ view, error: "Too many attempts. Try again in a few minutes." });
    expect(m.answerInvitation).not.toHaveBeenCalled();
  });
});
