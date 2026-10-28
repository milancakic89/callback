import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, RawJob } from "../types";

const { readData, writeData } = vi.hoisted(() => ({ readData: vi.fn(), writeData: vi.fn() }));
vi.mock("../store", () => ({ readData, writeData }));

import { runFinalize } from "./finalize";

const SEEN_AT = "2026-10-27T05:10:00.000Z";

const company = {
  jobertyId: 1,
  name: "Acme",
  slug: "acme",
  website: null,
  industry: null,
  employees: null,
  offices: ["Belgrade, Serbia"],
  reviewCount: 0,
  jobertyJobCount: 0,
  fetchedAt: SEEN_AT,
};

const raw = (overrides: Partial<RawJob> = {}): RawJob => ({
  externalId: "1",
  title: "Developer",
  url: "https://acme.example/jobs/1",
  location: "Belgrade, Serbia",
  countryCode: "rs",
  remote: null,
  department: null,
  postedAt: null,
  description: null,
  ...overrides,
});

const previousJob = (overrides: Partial<Job> = {}): Job => ({
  id: "dom:1",
  companyJobertyId: 1,
  companyName: "Acme",
  title: "Developer",
  locationRaw: "Belgrade, Serbia",
  country: "RS",
  isRemote: false,
  remoteScope: null,
  department: null,
  url: "https://acme.example/jobs/1",
  description: null,
  source: "dom",
  postedAt: null,
  detailsCheckedAt: null,
  firstSeenAt: "2026-10-01T00:00:00.000Z",
  lastSeenAt: "2026-10-26T05:00:00.000Z",
  active: true,
  ...overrides,
});

function files(scrapedJobs: RawJob[], previous: Job[], scrape: Record<string, unknown> = {}, jobertyJobs: RawJob[] = []) {
  const data: Record<string, unknown> = {
    "companies.json": [company],
    "careers.json": {},
    "jobs-raw.json": {
      "1": { status: "ok", source: "dom", ats: null, atsSlug: null, pageUrl: null, jobs: scrapedJobs, error: null, scrapedAt: SEEN_AT, ...scrape },
    },
    "joberty-jobs.json": {
      fetchedAt: jobertyJobs.length ? SEEN_AT : null,
      jobs: jobertyJobs.map((job) => ({ ...job, companyJobertyId: 1, companyName: "Acme" })),
    },
    "jobs.json": previous,
  };
  readData.mockImplementation(async (name: string) => data[name]);
}

const written = (): Job[] => writeData.mock.calls.find(([name]) => name === "jobs.json")![1];

beforeEach(() => {
  readData.mockReset();
  writeData.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The `descriptions` stage fills these in on jobs.json after finalize, from the job's own page; the
// next scrape starts from the raw list again, which has none of it, and must not wipe it.
describe("a re-scrape of a job the descriptions stage already filled in", () => {
  it("keeps the posting date, the description and the checked marker the list doesn't have", async () => {
    files(
      [raw()],
      [previousJob({ postedAt: "2026-10-20T00:00:00.000Z", description: "Read from the page", detailsCheckedAt: "2026-10-26T06:00:00.000Z" })],
    );

    await runFinalize();

    expect(written()).toEqual([
      expect.objectContaining({
        id: "dom:1",
        postedAt: "2026-10-20T00:00:00.000Z",
        description: "Read from the page",
        detailsCheckedAt: "2026-10-26T06:00:00.000Z",
        firstSeenAt: "2026-10-01T00:00:00.000Z",
        lastSeenAt: SEEN_AT,
        active: true,
      }),
    ]);
  });

  it("takes the date the list gives over one read from the page earlier", async () => {
    files([raw({ postedAt: "2026-10-25T00:00:00.000Z" })], [previousJob({ postedAt: "2026-10-20T00:00:00.000Z" })]);

    await runFinalize();

    expect(written()[0].postedAt).toBe("2026-10-25T00:00:00.000Z");
  });

  it("leaves a new job with no date, no marker, and the scrape time as first seen", async () => {
    files([raw({ externalId: "2", title: "Designer" })], []);

    await runFinalize();

    expect(written()[0]).toMatchObject({ id: "dom:2", postedAt: null, detailsCheckedAt: null, firstSeenAt: SEEN_AT });
  });

  it("keeps all of it on a job that has closed", async () => {
    files([], [previousJob({ postedAt: "2026-10-20T00:00:00.000Z", detailsCheckedAt: "2026-10-26T06:00:00.000Z" })]);

    await runFinalize();

    expect(written()[0]).toMatchObject({
      active: false,
      postedAt: "2026-10-20T00:00:00.000Z",
      detailsCheckedAt: "2026-10-26T06:00:00.000Z",
    });
  });
});

// A site whose robots.txt forbids something is no longer walked (http.ts). What was read from its
// pages before can't stay on the site as if it were current, so those jobs are closed. A site that
// merely couldn't be asked (403, a failing server) is a bad minute, and its jobs stay as they were.
describe("a company whose pages the robots.txt policy refuses", () => {
  const refused = (error: string) => ({ status: "needs_manual", source: null, jobs: [], error });
  const open = (id: string, source: string) => previousJob({ id, source, postedAt: "2026-10-20T00:00:00.000Z" });

  it("has its jobs closed, whatever their source, when the site said no", async () => {
    files([], [open("dom:1", "dom"), open("network:2", "network"), open("successfactors:3", "successfactors")], refused("blocked by robots.txt: Disallow /wp-admin/"));

    await runFinalize();

    expect(written().map((job) => [job.id, job.active])).toEqual([
      ["dom:1", false],
      ["network:2", false],
      ["successfactors:3", false],
    ]);
    // Closed, not forgotten: the row keeps what it had, so a later change of the rule can reopen it.
    expect(written()[0]).toMatchObject({ postedAt: "2026-10-20T00:00:00.000Z", firstSeenAt: "2026-10-01T00:00:00.000Z" });
  });

  it("also when the refusal arrived as an error from an adapter that walks pages (TalentLyft's hosted site)", async () => {
    files([], [open("talentlyft:1", "talentlyft")], { status: "error", error: "talentlyft acme: blocked by robots.txt: Disallow /api/" });

    await runFinalize();

    expect(written()[0].active).toBe(false);
  });

  it("keeps its jobs as they were when the site couldn't be asked", async () => {
    files([], [open("dom:1", "dom")], refused("robots.txt not readable: HTTP 403"));

    await runFinalize();

    expect(written()[0]).toMatchObject({ id: "dom:1", active: true });
  });

  it("still closes a job missing from a successful scrape, and keeps one after any other failure", async () => {
    files([], [open("dom:1", "dom")]);
    await runFinalize();
    expect(written()[0].active).toBe(false);

    writeData.mockReset();
    files([], [open("dom:1", "dom")], { status: "error", error: "timeout" });
    await runFinalize();
    expect(written()[0].active).toBe(true);
  });

  it("leaves Joberty's own list alone: it is a public API, not a page of the company", async () => {
    files([], [open("joberty:9", "joberty")], refused("blocked by robots.txt: Disallow /"), [raw({ externalId: "9", title: "Developer" })]);

    await runFinalize();

    expect(written().find((job) => job.id === "joberty:9")).toMatchObject({ active: true });
  });
});
