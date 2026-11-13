import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, previewOf } from "./preview";
import type { JobListItem } from "./types";

function jobPostedOn(id: string, postedAt: string | null, source = "greenhouse"): JobListItem {
  return {
    id,
    title: `Job ${id}`,
    companyName: "Acme",
    locationRaw: null,
    department: null,
    workMode: null,
    postedAt,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    url: null,
    source,
    active: true,
  };
}

describe("previewOf", () => {
  it("keeps the first page of the table, newest first, and counts every job", () => {
    const jobs = Array.from({ length: 30 }, (_, index) =>
      jobPostedOn(`job-${index}`, `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    );

    const { previewRows, totalCount } = previewOf(jobs);

    expect(totalCount).toBe(30);
    expect(previewRows).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(previewRows[0].id).toBe("job-29");
    expect(previewRows[DEFAULT_PAGE_SIZE - 1].id).toBe("job-10");
  });

  it("lists the jobs posted on Callback first, as the table does", () => {
    const jobs = [
      jobPostedOn("scraped-new", "2026-11-01T00:00:00.000Z"),
      jobPostedOn("callback:old", "2026-01-01T00:00:00.000Z", "callback"),
    ];

    expect(previewOf(jobs).previewRows.map((job) => job.id)).toEqual(["callback:old", "scraped-new"]);
  });

  it("is empty for no jobs", () => {
    expect(previewOf([])).toEqual({ previewRows: [], totalCount: 0 });
  });

  it("leaves the list it is given as it was", () => {
    const jobs = [jobPostedOn("older", "2026-01-01T00:00:00.000Z"), jobPostedOn("newer", "2026-02-01T00:00:00.000Z")];

    previewOf(jobs);

    expect(jobs.map((job) => job.id)).toEqual(["older", "newer"]);
  });
});
