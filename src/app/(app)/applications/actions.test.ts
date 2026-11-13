import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAccountType, hit, refresh, after, rpc, answerInvitation } = vi.hoisted(() => ({
  requireAccountType: vi.fn(),
  hit: vi.fn(),
  refresh: vi.fn(),
  after: vi.fn<(task: () => unknown) => void>(),
  rpc: vi.fn(),
  answerInvitation: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/server", () => ({ after }));
vi.mock("@/lib/auth/dal", () => ({ requireAccountType }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/lib/storage/deletions", () => ({ drainStorageDeletions: "drain" }));
vi.mock("@/lib/interviews/respond", () => ({ answerInvitation }));

import { respondToMyInterview, withdrawMyApplication } from "./actions";

const APPLICATION_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";

beforeEach(() => {
  vi.clearAllMocks();
  requireAccountType.mockResolvedValue({ id: "user-1", email: "ana@example.com", accountType: "candidate", companySlug: null });
  hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  rpc.mockResolvedValue({ data: true, error: null });
});

describe("withdrawMyApplication", () => {
  it("refuses an id that isn't a uuid, before anything else runs", async () => {
    expect(await withdrawMyApplication("nope")).toEqual({ ok: false, error: "Invalid request." });
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("withdraws through the caller's own client, then deletes the documents after the response", async () => {
    expect(await withdrawMyApplication(APPLICATION_ID)).toEqual({ ok: true });

    expect(requireAccountType).toHaveBeenCalledWith("candidate");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("withdraw_my_application", { p_application_id: APPLICATION_ID });
    expect(after).toHaveBeenCalledExactlyOnceWith("drain");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("answers when there is nothing to withdraw (another candidate's, or already withdrawn)", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    expect(await withdrawMyApplication(APPLICATION_ID)).toEqual({ ok: false, error: "This application is already withdrawn." });
    expect(after).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("answers a generic error when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });

    expect(await withdrawMyApplication(APPLICATION_ID)).toEqual({ ok: false, error: "Could not withdraw. Try again." });
    expect(after).not.toHaveBeenCalled();
  });

  it("is limited to 20 a minute", async () => {
    hit.mockResolvedValue({ count: 21, resetAt: Date.now() + 60_000 });

    expect(await withdrawMyApplication(APPLICATION_ID)).toEqual({ ok: false, error: "Too many changes. Try again in a minute." });
    expect(hit).toHaveBeenCalledWith("withdraw:user-1", 60_000);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("respondToMyInterview", () => {
  const view = { id: APPLICATION_ID, state: "confirmed" };

  it("refuses a bad id or answer, before anything else runs", async () => {
    expect(await respondToMyInterview("nope", "confirm")).toEqual({ ok: false, error: "Invalid request." });
    expect(await respondToMyInterview(APPLICATION_ID, "maybe" as never)).toEqual({ ok: false, error: "Invalid request." });
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(answerInvitation).not.toHaveBeenCalled();
  });

  it("answers as the signed-in candidate, never as someone a token names", async () => {
    answerInvitation.mockResolvedValue({ ok: true, response: "confirmed", view });

    expect(await respondToMyInterview(APPLICATION_ID, "confirm")).toEqual({ ok: true, response: "confirmed" });

    expect(requireAccountType).toHaveBeenCalledWith("candidate");
    expect(answerInvitation).toHaveBeenCalledExactlyOnceWith(APPLICATION_ID, "confirm", { kind: "candidate", userId: "user-1" });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says when the invitation has closed, and shows how it stands", async () => {
    answerInvitation.mockResolvedValue({ ok: false, reason: "closed", view: { ...view, state: "expired" } });

    expect(await respondToMyInterview(APPLICATION_ID, "decline")).toEqual({
      ok: false,
      error: "This invitation has already closed.",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says nothing about whose invitation it is when it isn't theirs", async () => {
    answerInvitation.mockResolvedValue({ ok: false, reason: "not_found" });

    expect(await respondToMyInterview(APPLICATION_ID, "confirm")).toEqual({ ok: false, error: "This invitation isn't available." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports a failure without its detail", async () => {
    answerInvitation.mockRejectedValue(new Error("secret detail"));

    const result = await respondToMyInterview(APPLICATION_ID, "confirm");
    expect(result).toEqual({ ok: false, error: "Could not save your answer. Try again." });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("is limited to 20 answers in 15 minutes", async () => {
    answerInvitation.mockResolvedValue({ ok: true, response: "declined", view });
    await respondToMyInterview(APPLICATION_ID, "decline");
    expect(hit).toHaveBeenCalledWith("interview-respond:user:user-1", 15 * 60_000);

    hit.mockResolvedValue({ count: 21, resetAt: Date.now() + 60_000 });
    answerInvitation.mockClear();
    expect(await respondToMyInterview(APPLICATION_ID, "decline")).toEqual({
      ok: false,
      error: "Too many attempts. Try again in a few minutes.",
    });
    expect(answerInvitation).not.toHaveBeenCalled();
  });
});
