import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, returns, eq, select } = vi.hoisted(() => {
  const returns = vi.fn();
  const eq = vi.fn(() => ({ returns }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })), returns, eq, select };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));

import { getApplications } from "./queries";

const row = (fields: Record<string, unknown> = {}) => ({
  job_id: "job-1",
  status: "PENDING",
  applied_at: "2026-11-01T09:00:00+00:00",
  job: { title: "Backend Engineer", company_name: "Beta", url: "https://example.com/job", active: true },
  ...fields,
});

beforeEach(() => vi.clearAllMocks());

describe("getApplications", () => {
  it("reads the caller's own applications with their jobs", async () => {
    returns.mockResolvedValue({ data: [], error: null });

    await getApplications("user-1");

    expect(from).toHaveBeenCalledWith("applications");
    expect(select).toHaveBeenCalledWith("job_id, status, applied_at, job:jobs(title, company_name, url, active)");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("maps each row as a job tracked by hand: the table tells the two kinds apart by it", async () => {
    returns.mockResolvedValue({ data: [row()], error: null });

    expect(await getApplications("user-1")).toEqual([
      {
        kind: "manual",
        jobId: "job-1",
        status: "PENDING",
        appliedAt: "2026-11-01T09:00:00+00:00",
        title: "Backend Engineer",
        companyName: "Beta",
        url: "https://example.com/job",
        active: true,
      },
    ]);
  });

  it("marks every row manual, so no row is ever keyed as a Callback one", async () => {
    returns.mockResolvedValue({ data: [row({ job_id: "a" }), row({ job_id: "b" })], error: null });

    const items = await getApplications("user-1");

    expect(items.map((item) => item.kind)).toEqual(["manual", "manual"]);
  });

  it("keeps a row whose job can't be read, rather than dropping it", async () => {
    returns.mockResolvedValue({ data: [row({ job: null })], error: null });

    const [item] = await getApplications("user-1");

    expect(item).toMatchObject({ title: "Job no longer available", companyName: "—", url: null, active: false });
  });

  it("is empty for a candidate with no applications", async () => {
    returns.mockResolvedValue({ data: null, error: null });

    expect(await getApplications("user-1")).toEqual([]);
  });

  it("throws on a database error", async () => {
    returns.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getApplications("user-1")).rejects.toThrow("getApplications: boom");
  });
});
