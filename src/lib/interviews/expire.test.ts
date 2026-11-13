import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  due: vi.fn(),
  update: vi.fn(),
  updateSelect: vi.fn(),
  accessTokenFor: vi.fn(),
  deleteEvent: vi.fn(),
  // What the query for due invitations and the update of each one filter on: [method, column, value].
  filters: [] as [string, string, unknown][],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/google/connection", () => ({ accessTokenFor: m.accessTokenFor }));
vi.mock("@/lib/google/calendar", () => ({ deleteEvent: m.deleteEvent }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          m.filters.push(["eq", column, value]);
          return {
            lte: (lteColumn: string, lteValue: unknown) => {
              m.filters.push(["lte", lteColumn, lteValue]);
              return { order: () => ({ limit: () => ({ returns: m.due }) }) };
            },
          };
        },
      }),
      update: (values: unknown) => {
        m.update(values);
        const chain = {
          eq: (column: string, value: unknown) => (m.filters.push(["update-eq", column, value]), chain),
          select: m.updateSelect,
        };
        return chain;
      },
    }),
  },
}));

import { expireDueInvitations } from "./expire";

beforeEach(() => {
  vi.clearAllMocks();
  m.filters.length = 0;
  m.due.mockResolvedValue({
    data: [
      { id: "a", company_id: "c1", google_event_id: "evt-a" },
      { id: "b", company_id: "c1", google_event_id: "evt-b" },
      { id: "c", company_id: "c2", google_event_id: null },
    ],
    error: null,
  });
  m.updateSelect.mockImplementation(async () => ({ data: [{ id: "x" }], error: null }));
  m.accessTokenFor.mockResolvedValue("access-token");
  m.deleteEvent.mockResolvedValue(undefined);
});

describe("expireDueInvitations", () => {
  it("looks only at pending invitations past their deadline, and updates only those still pending", async () => {
    const now = new Date("2030-01-10T09:00:00.000Z");
    await expireDueInvitations(now);

    expect(m.filters.slice(0, 2)).toEqual([
      ["eq", "status", "pending"],
      ["lte", "expires_at", "2030-01-10T09:00:00.000Z"],
    ]);
    // Each update names the row and requires it to be pending still, so an answer that came in a moment
    // ago is not overwritten.
    expect(m.filters.slice(2, 4)).toEqual([
      ["update-eq", "id", "a"],
      ["update-eq", "status", "pending"],
    ]);
  });

  it("closes each invitation that is due and takes its event out of the calendar", async () => {
    expect(await expireDueInvitations()).toEqual({ expired: 3, failed: 0 });

    expect(m.update).toHaveBeenCalledTimes(3);
    expect(m.update).toHaveBeenCalledWith({ status: "expired" });
    expect(m.deleteEvent).toHaveBeenCalledTimes(2);
    expect(m.deleteEvent).toHaveBeenCalledWith("access-token", "evt-a", false);
    expect(m.deleteEvent).toHaveBeenCalledWith("access-token", "evt-b", false);
  });

  it("asks for one access token for each company, not each invitation", async () => {
    await expireDueInvitations();

    expect(m.accessTokenFor).toHaveBeenCalledTimes(1);
    expect(m.accessTokenFor).toHaveBeenCalledWith("c1");
  });

  it("leaves an invitation that was answered a moment ago, and its event", async () => {
    m.updateSelect.mockResolvedValue({ data: [], error: null });

    expect(await expireDueInvitations()).toEqual({ expired: 0, failed: 0 });
    expect(m.deleteEvent).not.toHaveBeenCalled();
  });

  it("still closes the invitation when the calendar can't be reached", async () => {
    m.accessTokenFor.mockRejectedValue(new Error("needs to be connected again"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await expireDueInvitations()).toEqual({ expired: 3, failed: 0 });
    expect(m.deleteEvent).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("counts an event it could not delete, and carries on", async () => {
    m.deleteEvent.mockRejectedValueOnce(new Error("Google is down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await expireDueInvitations()).toEqual({ expired: 3, failed: 1 });
    expect(m.deleteEvent).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it("counts an invitation it could not update", async () => {
    m.updateSelect.mockResolvedValueOnce({ data: null, error: { message: "db" } });

    expect(await expireDueInvitations()).toEqual({ expired: 2, failed: 1 });
  });

  it("does nothing with nothing due, and fails loudly when it can't read", async () => {
    m.due.mockResolvedValue({ data: [], error: null });
    expect(await expireDueInvitations()).toEqual({ expired: 0, failed: 0 });

    m.due.mockResolvedValue({ data: null, error: { message: "db down" } });
    await expect(expireDueInvitations()).rejects.toThrow("db down");
  });
});
