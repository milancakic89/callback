import { describe, expect, it } from "vitest";
import type { JobListItem } from "@/lib/jobs/types";
import { newestPerCompany } from "./newest-jobs";

function job(id: string, companyName: string, postedAt: string, source = "greenhouse"): JobListItem {
  return {
    id,
    title: `Job ${id}`,
    companyName,
    locationRaw: null,
    department: null,
    workMode: null,
    postedAt,
    firstSeenAt: postedAt,
    url: null,
    source,
    active: true,
  };
}

const ids = (jobs: JobListItem[]) => jobs.map((item) => item.id);

describe("newestPerCompany", () => {
  it("lists the newest first", () => {
    const jobs = [job("old", "A", "2026-10-01T00:00:00Z"), job("new", "B", "2026-11-05T00:00:00Z"), job("mid", "C", "2026-10-20T00:00:00Z")];
    expect(ids(newestPerCompany(jobs, 6))).toEqual(["new", "mid", "old"]);
  });

  it("puts jobs posted on Callback first, as the job board does, even when they are older", () => {
    const jobs = [
      job("scraped-new", "A", "2026-11-08T00:00:00Z"),
      job("callback:old", "B", "2026-10-01T00:00:00Z", "callback"),
      job("callback:new", "C", "2026-10-15T00:00:00Z", "callback"),
      job("scraped-mid", "D", "2026-11-01T00:00:00Z"),
    ];
    expect(ids(newestPerCompany(jobs, 6))).toEqual(["callback:new", "callback:old", "scraped-new", "scraped-mid"]);
  });

  it("keeps one job per company, the first of its kind, ignoring case and spaces", () => {
    const jobs = [
      job("a1", "Acme", "2026-11-01T00:00:00Z"),
      job("a2", " ACME ", "2026-11-05T00:00:00Z"),
      job("a3", "acme", "2026-10-01T00:00:00Z"),
      job("b1", "Beta", "2026-10-15T00:00:00Z"),
    ];
    expect(ids(newestPerCompany(jobs, 6))).toEqual(["a2", "b1"]);
  });

  it("stops at the count", () => {
    const jobs = Array.from({ length: 10 }, (_, i) => job(`j${i}`, `Company ${i}`, `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z`));
    expect(newestPerCompany(jobs, 6)).toHaveLength(6);
    expect(newestPerCompany(jobs, 0)).toEqual([]);
  });

  it("falls back to when the job was first seen when it has no posted date", () => {
    const withoutDate = { ...job("seen", "A", "2026-10-01T00:00:00Z"), postedAt: null, firstSeenAt: "2026-11-09T00:00:00Z" };
    expect(ids(newestPerCompany([job("dated", "B", "2026-11-01T00:00:00Z"), withoutDate], 6))).toEqual(["seen", "dated"]);
  });

  it("does not change the list it is given", () => {
    const jobs = [job("old", "A", "2026-10-01T00:00:00Z"), job("new", "B", "2026-11-05T00:00:00Z")];
    newestPerCompany(jobs, 6);
    expect(ids(jobs)).toEqual(["old", "new"]);
  });

  it("is empty for no jobs", () => {
    expect(newestPerCompany([], 6)).toEqual([]);
  });
});
