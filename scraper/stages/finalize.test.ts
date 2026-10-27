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

function files(scrapedJobs: RawJob[], previous: Job[]) {
  const data: Record<string, unknown> = {
    "companies.json": [company],
    "careers.json": {},
    "jobs-raw.json": { "1": { status: "ok", source: "dom", ats: null, atsSlug: null, pageUrl: null, jobs: scrapedJobs, error: null, scrapedAt: SEEN_AT } },
    "joberty-jobs.json": { fetchedAt: null, jobs: [] },
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
