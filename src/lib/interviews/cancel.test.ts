import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  single: vi.fn(),
  rpc: vi.fn(),
  ownCompanyId: vi.fn(),
  accessTokenFor: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/google/connection", () => ({ ownCompanyId: m.ownCompanyId, accessTokenFor: m.accessTokenFor }));
vi.mock("@/lib/google/calendar", () => ({ deleteEvent: m.deleteEvent }));

import { cancelInvitation } from "./cancel";

const INVITATION_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const supabase = { rpc: m.rpc } as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockReturnValue({ single: m.single });
  m.single.mockResolvedValue({ data: { event_id: "evt-1", was_confirmed: false }, error: null });
  m.ownCompanyId.mockResolvedValue("company-1");
  m.accessTokenFor.mockResolvedValue("access-token");
  m.deleteEvent.mockResolvedValue(undefined);
});

describe("cancelInvitation", () => {
  it("cancels in the database and takes the event out of the calendar", async () => {
    expect(await cancelInvitation(supabase, INVITATION_ID)).toEqual({ ok: true, calendarCleaned: true });

    expect(m.rpc).toHaveBeenCalledWith("cancel_interview_invitation", { p_invitation_id: INVITATION_ID });
    expect(m.deleteEvent).toHaveBeenCalledWith("access-token", "evt-1", false);
  });

  it("lets Google tell a candidate who had confirmed", async () => {
    m.single.mockResolvedValue({ data: { event_id: "evt-1", was_confirmed: true }, error: null });

    await cancelInvitation(supabase, INVITATION_ID);
    expect(m.deleteEvent).toHaveBeenCalledWith("access-token", "evt-1", true);
  });

  it("has no calendar to clean when no event was made", async () => {
    m.single.mockResolvedValue({ data: { event_id: null, was_confirmed: false }, error: null });

    expect(await cancelInvitation(supabase, INVITATION_ID)).toEqual({ ok: true, calendarCleaned: true });
    expect(m.deleteEvent).not.toHaveBeenCalled();
  });

  it("stays cancelled when the calendar can't be reached, and says the event is still there", async () => {
    m.deleteEvent.mockRejectedValue(new Error("Google is down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await cancelInvitation(supabase, INVITATION_ID)).toEqual({ ok: true, calendarCleaned: false });
    log.mockRestore();
  });

  it("says when the invitation is closed already or isn't theirs", async () => {
    m.single.mockResolvedValue({ data: null, error: { message: "invitation_not_found", code: "P0002" } });

    expect(await cancelInvitation(supabase, INVITATION_ID)).toEqual({ ok: false, error: "That invitation is already closed." });
    expect(m.deleteEvent).not.toHaveBeenCalled();
  });

  it("reports any other failure without its detail", async () => {
    m.single.mockResolvedValue({ data: null, error: { message: "secret detail", code: "XX000" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await cancelInvitation(supabase, INVITATION_ID);
    expect(result).toEqual({ ok: false, error: "Could not cancel the invitation. Try again." });
    expect(JSON.stringify(result)).not.toContain("secret");
    log.mockRestore();
  });
});
