import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAccountType, hit, select, eq, from, refresh } = vi.hoisted(() => {
  const select = vi.fn();
  const eq = vi.fn(() => ({ select }));
  const deleteRows = vi.fn(() => ({ eq }));
  return {
    requireAccountType: vi.fn(),
    hit: vi.fn(),
    select,
    eq,
    from: vi.fn(() => ({ delete: deleteRows })),
    refresh: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ refresh }));
vi.mock("@/lib/auth/dal", () => ({ requireAccountType }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));

import { deleteJobPosting } from "./actions";

const JOB_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";

beforeEach(() => {
  vi.clearAllMocks();
  requireAccountType.mockResolvedValue({ id: "user-1", email: "boss@acme.example", accountType: "employer" });
  hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  select.mockResolvedValue({ data: [{ id: JOB_ID }], error: null });
});

describe("deleteJobPosting", () => {
  it("refuses an id that isn't a uuid, before anything else runs", async () => {
    for (const jobId of ["", "1", "not-a-uuid", `${JOB_ID}; drop table job_postings`]) {
      expect(await deleteJobPosting(jobId), jobId).toEqual({ ok: false, error: "Invalid request." });
    }
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("needs an employer account", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    requireAccountType.mockRejectedValue(redirected);

    await expect(deleteJobPosting(JOB_ID)).rejects.toBe(redirected);
    expect(requireAccountType).toHaveBeenCalledWith("employer");
    expect(from).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says the job wasn't found when row level security deletes nothing", async () => {
    select.mockResolvedValue({ data: [], error: null });

    expect(await deleteJobPosting(JOB_ID)).toEqual({ ok: false, error: "Job not found." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports a database error without saying it was deleted", async () => {
    select.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await deleteJobPosting(JOB_ID)).toEqual({ ok: false, error: "Could not delete. Try again." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("deletes the job and refreshes the dashboard", async () => {
    expect(await deleteJobPosting(JOB_ID)).toEqual({ ok: true });

    expect(from).toHaveBeenCalledWith("job_postings");
    expect(eq).toHaveBeenCalledWith("id", JOB_ID);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("is limited to 30 a minute per employer", async () => {
    await deleteJobPosting(JOB_ID);
    expect(hit).toHaveBeenCalledWith("delete-job:user-1", 60_000);

    hit.mockResolvedValue({ count: 30, resetAt: Date.now() + 60_000 });
    expect(await deleteJobPosting(JOB_ID)).toEqual({ ok: true });

    hit.mockResolvedValue({ count: 31, resetAt: Date.now() + 60_000 });
    from.mockClear();
    refresh.mockClear();
    expect(await deleteJobPosting(JOB_ID)).toEqual({
      ok: false,
      error: "Too many changes. Try again in a minute.",
    });
    expect(from).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
