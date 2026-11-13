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
  getJobDescription,
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

// What supabase-js's rpc() returns: an answer you can await as it is (one job, one company), or read
// a page of with .range(from, to), as the unfiltered list is.
function rpcAnswer(result: { data: unknown[] | null; error: { message: string } | null }) {
  const pageOf = async (from: number, to: number) =>
    result.data ? { data: result.data.slice(from, to + 1), error: null } : result;
  return Object.assign(Promise.resolve(result), { range: vi.fn(pageOf) });
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcPublic.mockReturnValue(rpcAnswer({ data: [POSTED], error: null }));
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
    rpcPublic.mockReturnValue(rpcAnswer({ data: [], error: null }));
    expect((await getActiveJobs()).map((job) => job.id)).toEqual(["greenhouse:42"]);
  });

  it("throws when the published jobs can't be read, so a list without them is never cached", async () => {
    rpcPublic.mockReturnValue(rpcAnswer({ data: null, error: { message: "boom" } }));
    await expect(getActiveJobs()).rejects.toThrow("published_job_postings: boom");
  });

  it("reads the posted jobs a page of 1000 at a time, so none past the first 1000 are cut", async () => {
    const postedJobs = Array.from({ length: 2500 }, (_, index) => ({ ...POSTED, id: `job-${index}` }));
    const answer = rpcAnswer({ data: postedJobs, error: null });
    rpcPublic.mockReturnValue(answer);

    const jobs = await getActiveJobs();

    expect(jobs).toHaveLength(2501);
    expect(answer.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("throws when a later page of the posted jobs fails, rather than listing the first ones only", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({ ...POSTED, id: `job-${index}` }));
    const answer = rpcAnswer({ data: firstPage, error: null });
    answer.range
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "page two" } });
    rpcPublic.mockReturnValue(answer);

    await expect(getActiveJobs()).rejects.toThrow("published_job_postings: page two");
  });

  it("reads the scraped jobs a page at a time too", async () => {
    const scrapedJobs = Array.from({ length: 1200 }, (_, index) => ({ ...SCRAPED, id: `greenhouse:${index}` }));
    const returns = vi
      .fn()
      .mockResolvedValueOnce({ data: scrapedJobs.slice(0, 1000), error: null })
      .mockResolvedValueOnce({ data: scrapedJobs.slice(1000), error: null });
    const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), returns };
    for (const key of ["select", "eq", "order", "range"] as const) chain[key].mockReturnValue(chain);
    fromPublic.mockReturnValue(chain);

    expect(await getActiveJobs()).toHaveLength(1201);
    expect(chain.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("throws when the scraped jobs can't be read", async () => {
    const returns = vi.fn().mockResolvedValue({ data: null, error: { message: "no jobs" } });
    const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), returns };
    for (const key of ["select", "eq", "order", "range"] as const) chain[key].mockReturnValue(chain);
    fromPublic.mockReturnValue(chain);

    await expect(getActiveJobs()).rejects.toThrow("getActiveJobs: no jobs");
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

describe("getJobDescription", () => {
  // The jobs table is asked for one row: .select().eq().eq().maybeSingle().
  function scrapedJob(answer: { data: unknown; error: { message: string } | null }) {
    const maybeSingle = vi.fn().mockResolvedValue(answer);
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle };
    for (const key of ["select", "eq"] as const) chain[key].mockReturnValue(chain);
    fromPublic.mockReturnValue(chain);
    return chain;
  }

  it("reads a scraped job's description from the jobs table, by the list id as it is", async () => {
    const chain = scrapedJob({ data: { description: "Scraped text." }, error: null });

    expect(await getJobDescription("greenhouse:42")).toBe("Scraped text.");
    expect(chain.eq).toHaveBeenCalledWith("id", "greenhouse:42");
    expect(rpcPublic).not.toHaveBeenCalled();
  });

  it("takes an id with a slash or a space in it, as half of the scraped ones have", async () => {
    scrapedJob({ data: { description: "From Himalayas." }, error: null });

    expect(await getJobDescription("himalayas:acme/senior designer")).toBe("From Himalayas.");
  });

  it("reads a posted job's description from the published jobs, by the id behind its list id", async () => {
    expect(await getJobDescription(`callback:${ID}`)).toBe("Own the design.");
    expect(rpcPublic).toHaveBeenCalledExactlyOnceWith("published_job_postings", { p_job_id: ID });
    expect(fromPublic).not.toHaveBeenCalled();
  });

  it("is null for a job with no text, one that isn't there, and a posted job that isn't published", async () => {
    scrapedJob({ data: { description: null }, error: null });
    expect(await getJobDescription("greenhouse:42")).toBeNull();

    scrapedJob({ data: null, error: null });
    expect(await getJobDescription("greenhouse:gone")).toBeNull();

    rpcPublic.mockReturnValue(rpcAnswer({ data: [], error: null }));
    expect(await getJobDescription(`callback:${OTHER_ID}`)).toBeNull();
  });

  it("is null for an id that can't be one, without asking the database", async () => {
    const tooLong = "x".repeat(256);
    for (const id of ["", tooLong, "line\nbreak", "nul\u0000byte", "callback:", "callback:not-a-uuid", `callback:${ID}x`]) {
      expect(await getJobDescription(id), JSON.stringify(id)).toBeNull();
    }
    expect(fromPublic).not.toHaveBeenCalled();
    expect(rpcPublic).not.toHaveBeenCalled();
  });

  it("throws on a database error rather than answering 'no description'", async () => {
    scrapedJob({ data: null, error: { message: "boom" } });
    await expect(getJobDescription("greenhouse:42")).rejects.toThrow("getJobDescription: boom");

    rpcPublic.mockReturnValue(rpcAnswer({ data: null, error: { message: "boom" } }));
    await expect(getJobDescription(`callback:${ID}`)).rejects.toThrow("published_job_postings: boom");
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

