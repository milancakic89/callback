import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, returns, order, select } = vi.hoisted(() => {
  const returns = vi.fn();
  const order = vi.fn(() => ({ returns }));
  const select = vi.fn(() => ({ order }));
  return { from: vi.fn(() => ({ select })), returns, order, select };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));

import { getCandidateSteps } from "./candidate-steps-queries";

beforeEach(() => vi.clearAllMocks());

describe("getCandidateSteps", () => {
  it("reads the steps in their order", async () => {
    returns.mockResolvedValue({ data: [], error: null });

    await getCandidateSteps();

    expect(from).toHaveBeenCalledWith("company_steps");
    expect(select).toHaveBeenCalledWith("id, position, name, description, used_at, updated_at, schedules_interview");
    expect(order).toHaveBeenCalledWith("position", { ascending: true });
  });

  it("maps each row to a step", async () => {
    returns.mockResolvedValue({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          position: 1,
          name: "Screening",
          description: "We read it.",
          used_at: "2026-11-09T10:00:00+00:00",
          updated_at: "2026-11-09T11:00:00+00:00",
          schedules_interview: true,
        },
      ],
      error: null,
    });

    expect(await getCandidateSteps()).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        position: 1,
        name: "Screening",
        description: "We read it.",
        usedAt: "2026-11-09T10:00:00+00:00",
        updatedAt: "2026-11-09T11:00:00+00:00",
        schedulesInterview: true,
      },
    ]);
  });

  it("answers an empty list for a company with none", async () => {
    returns.mockResolvedValue({ data: null, error: null });

    expect(await getCandidateSteps()).toEqual([]);
  });

  it("throws on a database error, since an empty list would offer to add steps again", async () => {
    returns.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getCandidateSteps()).rejects.toThrow("getCandidateSteps: boom");
  });
});
