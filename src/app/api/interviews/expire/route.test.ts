import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ env: {} as Record<string, string | undefined>, expireDueInvitations: vi.fn() }));

vi.mock("@/lib/env", () => ({ env: m.env }));
vi.mock("@/lib/interviews/expire", () => ({ expireDueInvitations: m.expireDueInvitations }));

import { POST } from "./route";

const SECRET = "s".repeat(40);
const post = (authorization?: string) =>
  POST(new Request("https://callback.rs/api/interviews/expire", { method: "POST", headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  m.env.CRON_SECRET = SECRET;
  m.expireDueInvitations.mockResolvedValue({ expired: 2, failed: 0 });
});

describe("POST /api/interviews/expire", () => {
  it("closes the invitations that are due and answers how many", async () => {
    const response = await post(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expired: 2, failed: 0 });
    expect(m.expireDueInvitations).toHaveBeenCalledOnce();
  });

  it("answers 404, as if there were no such route, to a wrong or missing secret", async () => {
    for (const header of [undefined, "", "Bearer", "Bearer wrong", `Bearer ${SECRET}x`, SECRET, `Basic ${SECRET}`]) {
      const response = await post(header);
      expect(response.status, String(header)).toBe(404);
    }
    expect(m.expireDueInvitations).not.toHaveBeenCalled();
  });

  it("does not exist at all without CRON_SECRET", async () => {
    m.env.CRON_SECRET = undefined;

    expect((await post("Bearer undefined")).status).toBe(404);
    expect((await post("Bearer ")).status).toBe(404);
    expect(m.expireDueInvitations).not.toHaveBeenCalled();
  });

  it("answers 500 without the detail when it fails", async () => {
    m.expireDueInvitations.mockRejectedValue(new Error("secret detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await post(`Bearer ${SECRET}`);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    log.mockRestore();
  });
});
