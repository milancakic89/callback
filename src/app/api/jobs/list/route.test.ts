import { beforeEach, describe, expect, it, vi } from "vitest";

const { getActiveJobs } = vi.hoisted(() => ({ getActiveJobs: vi.fn() }));
vi.mock("@/lib/jobs/queries", () => ({ getActiveJobs }));

import { GET } from "./route";

const JOB = {
  id: "greenhouse:42",
  title: "Backend Engineer",
  companyName: "Elsewhere",
  locationRaw: null,
  department: null,
  workMode: null,
  postedAt: null,
  firstSeenAt: "2026-11-01T00:00:00.000Z",
  url: null,
  source: "greenhouse",
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/jobs/list", () => {
  it("answers the cached job list as JSON", async () => {
    getActiveJobs.mockResolvedValue([JOB]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual([JOB]);
  });

  it("answers an empty list when there are no jobs", async () => {
    getActiveJobs.mockResolvedValue([]);

    expect(await (await GET()).json()).toEqual([]);
  });

  it("fails, rather than answering a list without the jobs, when the list can't be read", async () => {
    getActiveJobs.mockRejectedValue(new Error("published_job_postings: boom"));

    await expect(GET()).rejects.toThrow("published_job_postings: boom");
  });
});
