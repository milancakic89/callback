import { beforeEach, describe, expect, it, vi } from "vitest";

const { getJobDescription } = vi.hoisted(() => ({ getJobDescription: vi.fn() }));
vi.mock("@/lib/jobs/queries", () => ({ getJobDescription }));

import { GET } from "./route";

const request = new Request("http://localhost/api/jobs/descriptions/x");
const withId = (jobId: string) => ({ params: Promise.resolve({ jobId }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/jobs/descriptions/[jobId]", () => {
  it("answers the job's description as JSON", async () => {
    getJobDescription.mockResolvedValue("Own the design.");

    const response = await GET(request, withId("greenhouse:42"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ description: "Own the design." });
    expect(getJobDescription).toHaveBeenCalledExactlyOnceWith("greenhouse:42");
  });

  it("asks for the id as the table knows it, slash and spaces included", async () => {
    getJobDescription.mockResolvedValue("Text.");

    await GET(request, withId("himalayas:acme/senior designer"));

    expect(getJobDescription).toHaveBeenCalledExactlyOnceWith("himalayas:acme/senior designer");
  });

  it("answers 404 for a job with no description, an id nobody has and an id that can't be one", async () => {
    getJobDescription.mockResolvedValue(null);

    for (const jobId of ["greenhouse:no-text", "greenhouse:gone", "not an id\n"]) {
      const response = await GET(request, withId(jobId));
      expect(response.status, jobId).toBe(404);
    }
  });

  it("fails, rather than answering 404, when the database can't be read", async () => {
    getJobDescription.mockRejectedValue(new Error("getJobDescription: boom"));

    await expect(GET(request, withId("greenhouse:42"))).rejects.toThrow("getJobDescription: boom");
  });
});
