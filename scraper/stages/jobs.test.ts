import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AtsAdapter } from "../ats/adapter";
import type { CareersResult, Company, CompanyScrape } from "../types";

const { readData, writeData, crawlPolicy, fetchHtml, getAdapter } = vi.hoisted(() => ({
  readData: vi.fn(),
  writeData: vi.fn(),
  crawlPolicy: vi.fn(),
  fetchHtml: vi.fn(),
  getAdapter: vi.fn(),
}));
vi.mock("../store", () => ({ readData, writeData, createSaver: (save: () => Promise<void>) => save }));
vi.mock("../http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../http")>()),
  crawlPolicy,
  fetchHtml,
  robotsAllowed: async (url: string) => (await crawlPolicy(url)).allowed,
}));
vi.mock("../ats/registry", () => ({ getAdapter }));
vi.mock("../browser", () => ({ isBlocked: vi.fn(), withPage: vi.fn() }));
vi.mock("./finalize", () => ({ runFinalize: vi.fn() }));

import { isRobotsDisallowed } from "../http";
import { runJobs } from "./jobs";

const company = (jobertyId: number): Company => ({
  jobertyId,
  name: `Company ${jobertyId}`,
  slug: `company-${jobertyId}`,
  website: `https://c${jobertyId}.example`,
  industry: null,
  employees: null,
  offices: ["Belgrade, Serbia"],
  reviewCount: 0,
  jobertyJobCount: 0,
  fetchedAt: "2026-10-01T00:00:00.000Z",
});

const careers = (fields: Partial<CareersResult>): CareersResult => ({
  status: "found",
  careersUrl: null,
  via: "static",
  ats: null,
  atsSlug: null,
  confidence: 0.8,
  candidates: [],
  error: null,
  checkedAt: "2026-10-01T00:00:00.000Z",
  ...fields,
});

const options = {
  only: [],
  limit: null,
  force: false,
  browser: true,
  concurrency: 1,
  signal: new AbortController().signal,
};

async function run(companies: Company[], careersById: Record<string, CareersResult>) {
  const data: Record<string, unknown> = { "companies.json": companies, "careers.json": careersById, "jobs-raw.json": {} };
  readData.mockImplementation(async (name: string) => data[name]);
  await runJobs(options);
  const written = writeData.mock.calls.filter(([name]) => name === "jobs-raw.json").at(-1)!;
  return written[1] as Record<string, CompanyScrape>;
}

beforeEach(() => {
  for (const mock of [readData, writeData, crawlPolicy, fetchHtml, getAdapter]) mock.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  getAdapter.mockReturnValue(null);
  crawlPolicy.mockResolvedValue({ allowed: true, error: null });
});

describe("a company whose jobs are read by going through its careers page", () => {
  it("is not read when the site's robots.txt forbids something: no page is fetched, and the scrape says why", async () => {
    crawlPolicy.mockResolvedValue({ allowed: false, error: "blocked by robots.txt: Disallow /wp-admin/" });

    const scrapes = await run([company(1)], { 1: careers({ careersUrl: "https://c1.example/careers" }) });

    expect(crawlPolicy).toHaveBeenCalledWith("https://c1.example/careers");
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(scrapes[1]).toMatchObject({ status: "needs_manual", jobs: [], source: null });
    expect(isRobotsDisallowed(scrapes[1].error)).toBe(true);
  });

  it("keeps 'couldn't ask' apart from 'said no', which is what decides whether its jobs are closed", async () => {
    crawlPolicy.mockResolvedValue({ allowed: false, error: "robots.txt not readable: HTTP 403" });

    const scrapes = await run([company(1)], { 1: careers({ careersUrl: "https://c1.example/careers" }) });

    expect(scrapes[1].status).toBe("needs_manual");
    expect(isRobotsDisallowed(scrapes[1].error)).toBe(false);
  });

  it("is read as before when the site forbids nothing", async () => {
    fetchHtml.mockResolvedValue({ usable: false, html: "", blocked: false, status: 200, url: "https://c1.example/careers", error: "HTTP 200, 5 bytes of HTML" });

    const scrapes = await run([company(1)], { 1: careers({ careersUrl: "https://c1.example/careers" }) });

    expect(fetchHtml).toHaveBeenCalledWith("https://c1.example/careers");
    expect(scrapes[1].error).toBe("no jobs found on the careers page");
  });
});

describe("a company whose jobs come from an ATS's public API", () => {
  it("is read whatever its own site's robots.txt says: no page of it is walked", async () => {
    crawlPolicy.mockResolvedValue({ allowed: false, error: "blocked by robots.txt: Disallow /" });
    const fetchJobs = vi.fn().mockResolvedValue([]);
    getAdapter.mockReturnValue({ name: "greenhouse", fetchJobs } as unknown as AtsAdapter);

    const scrapes = await run([company(2)], { 2: careers({ ats: "greenhouse", atsSlug: "acme", careersUrl: "https://c2.example/careers" }) });

    expect(fetchJobs).toHaveBeenCalledWith("acme");
    expect(crawlPolicy).not.toHaveBeenCalled();
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(scrapes[2]).toMatchObject({ status: "ok", source: "greenhouse" });
  });
});
