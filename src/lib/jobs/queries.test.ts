import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcPublic, fromPublic, rpcUser } = vi.hoisted(() => ({
  rpcPublic: vi.fn(),
  fromPublic: vi.fn(),
  rpcUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ supabasePublic: { rpc: rpcPublic, from: fromPublic } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: rpcUser }) }));

import {
  getActiveJobs,
  getCompanyPublishedJobs,
  getJobDescriptions,
  getPublishedJob,
} from "./queries";

const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const OTHER_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";

const POSTED = {
  id: ID,
  title: "Senior Product Designer",
  description: "Own the design.",
  location_raw: "Belgrade, Serbia",
  work_mode: "HYBRID",
  published_at: "2026-11-09T10:00:00.000Z",
  company_name: "Acme d.o.o.",
  company_slug: "acme",
  // Not columns of the public function; a mistake in it must not reach the page.
  required_filters: ["React"],
};

const SCRAPED = {
  id: "greenhouse:42",
  title: "Backend Engineer",
  company_name: "Elsewhere",
  location_raw: "Remote",
  department: null,
  work_mode: "REMOTE",
  posted_at: "2026-11-01T00:00:00.000Z",
  first_seen_at: "2026-11-01T00:00:00.000Z",
  url: "https://example.com/42",
  source: "greenhouse",
  active: true,
};

// The jobs table is read page by page: .select().eq().order().range().returns().
function scrapedTable(rows: unknown[]) {
  const returns = vi.fn().mockResolvedValue({ data: rows, error: null });
  const chain = { select: vi.fn(), eq: vi.fn(), not: vi.fn(), order: vi.fn(), range: vi.fn(), returns };
  for (const key of ["select", "eq", "not", "order", "range"] as const) chain[key].mockReturnValue(chain);
  fromPublic.mockReturnValue(chain);
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcPublic.mockResolvedValue({ data: [POSTED], error: null });
  scrapedTable([SCRAPED]);
});

describe("getActiveJobs", () => {
  it("lists the posted jobs with the scraped ones, as native rows with no filters", async () => {
    const jobs = await getActiveJobs();

    expect(rpcPublic).toHaveBeenCalledExactlyOnceWith("published_job_postings", {});
    expect(jobs.map((job) => job.id)).toEqual([`callback:${ID}`, "greenhouse:42"]);
    expect(jobs[0]).toMatchObject({ source: "callback", url: null, active: true, companyName: "Acme d.o.o." });
    expect(JSON.stringify(jobs)).not.toMatch(/filter|React|description/i);
  });

  it("lists only the scraped jobs when nothing is published", async () => {
    rpcPublic.mockResolvedValue({ data: [], error: null });
    expect((await getActiveJobs()).map((job) => job.id)).toEqual(["greenhouse:42"]);
  });

  it("throws when the published jobs can't be read, so a list without them is never cached", async () => {
    rpcPublic.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getActiveJobs()).rejects.toThrow("published_job_postings: boom");
  });
});

describe("getJobDescriptions", () => {
  it("adds a posted job's description under its list id", async () => {
    scrapedTable([{ id: "greenhouse:42", description: "Scraped text." }]);

    expect(await getJobDescriptions()).toEqual({
      [`callback:${ID}`]: "Own the design.",
      "greenhouse:42": "Scraped text.",
    });
  });
});

describe("getPublishedJob", () => {
  it("asks for that one job and maps it with no filters", async () => {
    const job = await getPublishedJob(ID);

    expect(rpcPublic).toHaveBeenCalledExactlyOnceWith("published_job_postings", { p_job_id: ID });
    expect(job).toEqual({
      id: ID,
      title: "Senior Product Designer",
      description: "Own the design.",
      locationRaw: "Belgrade, Serbia",
      workMode: "HYBRID",
      publishedAt: "2026-11-09T10:00:00.000Z",
      companyName: "Acme d.o.o.",
      companySlug: "acme",
    });
  });

  it("is null for an unpublished or unknown job, the demo job included: the function doesn't return them", async () => {
    rpcPublic.mockResolvedValue({ data: [], error: null });
    expect(await getPublishedJob(OTHER_ID)).toBeNull();
  });

  it("is null for an id that isn't a uuid, without asking the database", async () => {
    for (const id of ["nope", "", "callback:abc", `${ID}x`]) expect(await getPublishedJob(id), id).toBeNull();
    expect(rpcPublic).not.toHaveBeenCalled();
  });

  it("throws on a database error rather than answering 'not found'", async () => {
    rpcPublic.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getPublishedJob(ID)).rejects.toThrow("published_job_postings: boom");
  });
});

describe("getCompanyPublishedJobs", () => {
  it("asks the public function for the company's jobs only, and maps them with no filters", async () => {
    const jobs = await getCompanyPublishedJobs("acme");

    expect(rpcPublic).toHaveBeenCalledWith("published_job_postings", { p_company_slug: "acme" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: ID, title: "Senior Product Designer", companySlug: "acme" });
    expect(jobs[0]).not.toHaveProperty("required_filters");
    expect(jobs[0]).not.toHaveProperty("requiredFilters");
  });

  it("answers no jobs, without asking, for a slug that can't be a company's", async () => {
    expect(await getCompanyPublishedJobs("jobs")).toEqual([]);
    expect(await getCompanyPublishedJobs("x".repeat(500))).toEqual([]);
    expect(rpcPublic).not.toHaveBeenCalled();
  });

  it("throws on a database error, so the cache never keeps an empty list", async () => {
    rpcPublic.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getCompanyPublishedJobs("acme")).rejects.toThrow("published_job_postings: boom");
  });
});

