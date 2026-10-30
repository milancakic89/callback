import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, selectJobs, selectJob, order, returns, is, not, eq, maybeSingle } = vi.hoisted(() => {
  const returns = vi.fn();
  const order = vi.fn(() => ({ returns }));
  const not = vi.fn(() => ({ order }));
  const is = vi.fn(() => ({ not }));
  const selectJobs = vi.fn(() => ({ is }));
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const selectJob = vi.fn(() => ({ eq }));
  return {
    from: vi.fn(),
    selectJobs,
    selectJob,
    order,
    returns,
    is,
    not,
    eq,
    maybeSingle,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));

import { getCompanyJob, getCompanyJobs } from "./workspace";

const JOB_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCompanyJobs", () => {
  beforeEach(() => {
    from.mockReturnValue({ select: selectJobs });
  });

  it("maps the published date and the two counts, and filters each embed by withdrawn_at", async () => {
    returns.mockResolvedValue({
      data: [
        {
          id: "a",
          title: "Published job",
          is_demo: false,
          published_at: "2026-10-30T10:00:00Z",
          created_at: "2026-10-30T09:00:00Z",
          active: [{ count: 3 }],
          withdrawn: [{ count: 2 }],
        },
        {
          id: "b",
          title: "Draft",
          is_demo: true,
          published_at: null,
          created_at: "2026-10-29T09:00:00Z",
          active: [],
          withdrawn: [],
        },
      ],
      error: null,
    });

    expect(await getCompanyJobs()).toEqual([
      {
        id: "a",
        title: "Published job",
        isDemo: false,
        publishedAt: "2026-10-30T10:00:00Z",
        createdAt: "2026-10-30T09:00:00Z",
        applicantCount: 3,
        withdrawnCount: 2,
      },
      {
        id: "b",
        title: "Draft",
        isDemo: true,
        publishedAt: null,
        createdAt: "2026-10-29T09:00:00Z",
        applicantCount: 0,
        withdrawnCount: 0,
      },
    ]);
    expect(from).toHaveBeenCalledWith("job_postings");
    expect(is).toHaveBeenCalledWith("active.withdrawn_at", null);
    expect(not).toHaveBeenCalledWith("withdrawn.withdrawn_at", "is", null);
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("throws on a database error", async () => {
    returns.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getCompanyJobs()).rejects.toThrow("getCompanyJobs: boom");
  });
});

describe("getCompanyJob", () => {
  beforeEach(() => {
    from.mockReturnValue({ select: selectJob });
  });

  it("answers null for an id that isn't a uuid, without asking the database", async () => {
    for (const jobId of ["", "1", "not-a-uuid", `${JOB_ID}'; drop table job_postings`]) {
      expect(await getCompanyJob(jobId), jobId).toBeNull();
    }
    expect(from).not.toHaveBeenCalled();
  });

  it("answers null when row level security hides the job or it doesn't exist", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await getCompanyJob(JOB_ID)).toBeNull();
    expect(eq).toHaveBeenCalledWith("id", JOB_ID);
  });

  it("maps the job and its filter lists, with an empty string for a missing location", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: JOB_ID,
        title: "Designer",
        description: "Design.",
        location_raw: null,
        work_mode: "REMOTE",
        required_filters: ["Figma", "5+ years"],
        optional_filters: [],
        is_demo: false,
      },
      error: null,
    });

    expect(await getCompanyJob(JOB_ID)).toEqual({
      id: JOB_ID,
      title: "Designer",
      description: "Design.",
      location: "",
      workMode: "REMOTE",
      requiredFilters: ["Figma", "5+ years"],
      optionalFilters: [],
      isDemo: false,
    });
  });

  it("selects the two filter columns", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await getCompanyJob(JOB_ID);

    expect(selectJob).toHaveBeenCalledOnce();
    expect(selectJob.mock.calls[0]).toEqual([expect.stringContaining("required_filters, optional_filters")]);
  });

  it("throws on a database error", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getCompanyJob(JOB_ID)).rejects.toThrow("getCompanyJob: boom");
  });
});
