import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtsAdapter } from "../ats/adapter";
import type { StageOptions } from "../options";
import type { Job } from "../types";

const { readData, writeData, fetchHtml, renderPage, getAdapter } = vi.hoisted(() => ({
  readData: vi.fn(),
  writeData: vi.fn(),
  fetchHtml: vi.fn(),
  renderPage: vi.fn(),
  getAdapter: vi.fn(),
}));
vi.mock("../store", () => ({ readData, writeData, createSaver: (save: () => Promise<void>) => save }));
vi.mock("../http", () => ({ fetchHtml }));
vi.mock("../browser", () => ({ renderPage }));
vi.mock("../ats/registry", () => ({ getAdapter }));

import { runDescriptions } from "./descriptions";

const NOW = new Date("2026-10-27T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "dom:acme-1",
    companyJobertyId: 1,
    companyName: "Acme",
    title: "Developer",
    locationRaw: "Belgrade",
    country: "RS",
    isRemote: false,
    remoteScope: null,
    department: null,
    url: "https://acme.example/jobs/1",
    description: "Text the list gave.",
    source: "dom",
    postedAt: null,
    detailsCheckedAt: null,
    firstSeenAt: "2026-10-01T00:00:00.000Z",
    lastSeenAt: "2026-10-26T00:00:00.000Z",
    active: true,
    ...overrides,
  };
}

const options = (overrides: Partial<StageOptions> = {}): StageOptions => ({
  only: [],
  limit: null,
  force: false,
  browser: false,
  concurrency: 1,
  signal: new AbortController().signal,
  ...overrides,
});

const pageWith = (body: string) => ({ usable: true, html: `<!doctype html><html><body>${body}</body></html>`, error: null });
const jobPosting = (datePosted: string) =>
  `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Developer", datePosted })}</script>`;

// What was last written to jobs.json.
const saved = (): Job[] => writeData.mock.calls.filter(([name]) => name === "jobs.json").at(-1)![1];
const savedJob = (id: string) => saved().find((j) => j.id === id)!;

async function run(jobs: Job[], opts = options()) {
  readData.mockResolvedValue(jobs);
  await runDescriptions(opts);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const mock of [readData, writeData, fetchHtml, renderPage, getAdapter]) mock.mockReset();
  getAdapter.mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a job with no posting date", () => {
  it("takes the date from its own page, and leaves the description the list gave alone", async () => {
    fetchHtml.mockResolvedValue(pageWith(`${jobPosting("2026-10-20")}<main>${"A different, guessed text. ".repeat(20)}</main>`));

    await run([job()]);

    expect(fetchHtml).toHaveBeenCalledWith("https://acme.example/jobs/1");
    expect(savedJob("dom:acme-1")).toMatchObject({
      postedAt: "2026-10-20T00:00:00.000Z",
      description: "Text the list gave.",
      detailsCheckedAt: NOW.toISOString(),
    });
  });

  it("is marked as read even when the page has no date, so it isn't fetched again tomorrow", async () => {
    fetchHtml.mockResolvedValue(pageWith("<main>No structured data here</main>"));

    await run([job()]);

    expect(savedJob("dom:acme-1")).toMatchObject({ postedAt: null, detailsCheckedAt: NOW.toISOString() });
  });

  it("is left for a later run when its page couldn't be read (no marker)", async () => {
    fetchHtml.mockResolvedValue({ usable: false, html: "", error: "HTTP 503" });

    await run([job()]);

    expect(savedJob("dom:acme-1")).toMatchObject({ postedAt: null, detailsCheckedAt: null });
  });

  it("is read with the browser for a page that needs one, when the browser is on", async () => {
    fetchHtml.mockResolvedValue({ usable: false, html: "", error: "HTTP 200, 120 bytes of HTML" });
    renderPage.mockResolvedValue({ url: "https://acme.example/jobs/1", html: pageWith(jobPosting("2026-09-01")).html, requests: [] });

    await run([job()], options({ browser: true }));

    expect(savedJob("dom:acme-1").postedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  // fetchHtml refuses a page that robots.txt disallows; rendering it in the browser instead would
  // read the very page the site asked robots not to.
  it("is not rendered in the browser when robots.txt disallows it", async () => {
    fetchHtml.mockResolvedValue({ usable: false, html: "", blocked: true, error: "blocked by robots.txt" });

    await run([job()], options({ browser: true }));

    expect(renderPage).not.toHaveBeenCalled();
    expect(savedJob("dom:acme-1")).toMatchObject({ postedAt: null, detailsCheckedAt: null });
  });

  it("keeps a date it can't trust out of the data", async () => {
    fetchHtml.mockResolvedValue(pageWith(jobPosting("01.10.2026")));

    await run([job()]);

    expect(savedJob("dom:acme-1").postedAt).toBeNull();
  });
});

describe("which jobs are read", () => {
  it("skips a job read in the last 14 days, and reads one last read longer ago", async () => {
    fetchHtml.mockResolvedValue(pageWith(jobPosting("2026-10-20")));
    const recent = job({ id: "dom:recent", url: "https://acme.example/jobs/recent", detailsCheckedAt: daysAgo(3) });
    const stale = job({ id: "dom:stale", url: "https://acme.example/jobs/stale", detailsCheckedAt: daysAgo(20) });

    await run([recent, stale]);

    expect(fetchHtml).toHaveBeenCalledOnce();
    expect(fetchHtml).toHaveBeenCalledWith("https://acme.example/jobs/stale");
    expect(savedJob("dom:recent").postedAt).toBeNull();
    expect(savedJob("dom:stale").postedAt).toBe("2026-10-20T00:00:00.000Z");
  });

  it("skips a job that already has both a date and a description", async () => {
    await run([job({ postedAt: "2026-10-01T00:00:00.000Z" })]);

    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it("skips closed jobs", async () => {
    await run([job({ active: false })]);

    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it("reads every matching job on --force, whatever it was last read", async () => {
    fetchHtml.mockResolvedValue(pageWith(jobPosting("2026-10-20")));

    await run([job({ detailsCheckedAt: daysAgo(1), postedAt: "2026-10-01T00:00:00.000Z" })], options({ force: true }));

    expect(fetchHtml).toHaveBeenCalledOnce();
  });

  it("still fills a missing description, as before, and doesn't wait 14 days to retry a page that failed", async () => {
    fetchHtml.mockResolvedValue(
      pageWith(`<main>${"The real job text, long enough to be taken as the description. ".repeat(10)}</main>`),
    );

    await run([job({ description: null, postedAt: "2026-10-01T00:00:00.000Z" })]);

    expect(savedJob("dom:acme-1").description).toContain("The real job text");
  });
});

describe("what a source already said is never replaced", () => {
  it("keeps the date the source gave, even when the page says another", async () => {
    fetchHtml.mockResolvedValue(pageWith(jobPosting("2026-10-20")));

    await run([job({ description: null, postedAt: "2026-09-15T00:00:00.000Z" })]);

    expect(savedJob("dom:acme-1").postedAt).toBe("2026-09-15T00:00:00.000Z");
  });
});

describe("an ATS with a detail call", () => {
  const detailsAdapter = (fetchDetails: AtsAdapter["fetchDetails"]) => ({ name: "workday", fetchDetails }) as unknown as AtsAdapter;
  const workdayJob = job({
    id: "workday:R-1001",
    source: "workday",
    url: "https://acme.wd3.myworkdayjobs.com/careers/job/Belgrade/Dev_R-1001",
    description: null,
  });

  it("gets the description and the date from that one call, and the page isn't fetched", async () => {
    const fetchDetails = vi.fn().mockResolvedValue({ description: "From Workday", postedAt: "2026-10-22T00:00:00.000Z" });
    getAdapter.mockReturnValue(detailsAdapter(fetchDetails));

    await run([workdayJob]);

    expect(fetchDetails).toHaveBeenCalledWith({ externalId: "R-1001", url: workdayJob.url });
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(savedJob("workday:R-1001")).toMatchObject({
      description: "From Workday",
      postedAt: "2026-10-22T00:00:00.000Z",
      detailsCheckedAt: NOW.toISOString(),
    });
  });

  it("is trusted about the date: a Workday job with none isn't searched for one on its single-page-app page", async () => {
    getAdapter.mockReturnValue(detailsAdapter(vi.fn().mockResolvedValue({ description: "From Workday", postedAt: null })));

    await run([workdayJob]);

    expect(fetchHtml).not.toHaveBeenCalled();
    expect(savedJob("workday:R-1001")).toMatchObject({ postedAt: null, detailsCheckedAt: NOW.toISOString() });
  });

  it("falls back to the page for a description when the call failed, with no marker unless the page is read", async () => {
    getAdapter.mockReturnValue(detailsAdapter(vi.fn().mockResolvedValue(null)));
    fetchHtml.mockResolvedValue({ usable: false, html: "", error: "HTTP 503" });

    await run([workdayJob]);

    expect(fetchHtml).toHaveBeenCalledOnce();
    expect(savedJob("workday:R-1001")).toMatchObject({ description: null, postedAt: null, detailsCheckedAt: null });
  });
});

describe("a failure on one job", () => {
  it("is logged against that job, and the others are still read", async () => {
    fetchHtml.mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValue(pageWith(jobPosting("2026-10-20")));

    await run([job({ id: "dom:a", url: "https://a.example/1" }), job({ id: "dom:b", url: "https://b.example/1" })]);

    expect(savedJob("dom:a").postedAt).toBeNull();
    expect(savedJob("dom:a").detailsCheckedAt).toBeNull();
    expect(savedJob("dom:b").postedAt).toBe("2026-10-20T00:00:00.000Z");
  });
});
