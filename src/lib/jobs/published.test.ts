import { describe, expect, it } from "vitest";
import { listId, postingIdOf, postingPath, toListItem, toPublishedJob, type PublishedJobRow } from "./published";
import { isNativeJob } from "./types";

const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const ROW: PublishedJobRow = {
  id: ID,
  title: "Senior Product Designer",
  description: "Own the design of a tool.\n\nSecond paragraph.",
  location_raw: "Belgrade, Serbia",
  work_mode: "HYBRID",
  published_at: "2026-11-09T10:00:00.000Z",
  company_name: "Acme d.o.o.",
  company_slug: "acme",
};

describe("toPublishedJob", () => {
  it("maps the columns to camelCase", () => {
    expect(toPublishedJob(ROW)).toEqual({
      id: ID,
      title: "Senior Product Designer",
      description: "Own the design of a tool.\n\nSecond paragraph.",
      locationRaw: "Belgrade, Serbia",
      workMode: "HYBRID",
      publishedAt: "2026-11-09T10:00:00.000Z",
      companyName: "Acme d.o.o.",
      companySlug: "acme",
    });
  });

  it("carries no filters, even if the database one day returned them", () => {
    const leaky = { ...ROW, required_filters: ["React"], optional_filters: ["English C1"], is_demo: false, applicant_count: 4 };
    const job = toPublishedJob(leaky as PublishedJobRow);

    expect(Object.keys(job).sort()).toEqual([
      "companyName",
      "companySlug",
      "description",
      "id",
      "locationRaw",
      "publishedAt",
      "title",
      "workMode",
    ]);
    expect(JSON.stringify(job)).not.toMatch(/React|English|filters|demo|applicant/i);
  });
});

describe("toListItem", () => {
  it("is a native job in the job table's shape, from the day it was published, with no filters and no link out", () => {
    const item = toListItem(toPublishedJob(ROW));

    expect(item).toEqual({
      id: `callback:${ID}`,
      title: "Senior Product Designer",
      companyName: "Acme d.o.o.",
      locationRaw: "Belgrade, Serbia",
      department: null,
      workMode: "HYBRID",
      postedAt: "2026-11-09T10:00:00.000Z",
      firstSeenAt: "2026-11-09T10:00:00.000Z",
      url: null,
      source: "callback",
      active: true,
    });
    expect(isNativeJob(item)).toBe(true);
    // The list is sent to every visitor's browser: the description loads separately, and the
    // filters are never part of it.
    expect(item).not.toHaveProperty("description");
    expect(JSON.stringify(item)).not.toMatch(/filter/i);
  });

  it("keeps a missing location and work mode as null", () => {
    const item = toListItem(toPublishedJob({ ...ROW, location_raw: null, work_mode: null }));
    expect(item.locationRaw).toBeNull();
    expect(item.workMode).toBeNull();
  });
});

describe("list ids", () => {
  it("put the source in front of the posting id, and take it off again", () => {
    expect(listId(ID)).toBe(`callback:${ID}`);
    expect(postingIdOf(`callback:${ID}`)).toBe(ID);
  });

  it("are not a scraped job's: those have no posting", () => {
    for (const id of ["greenhouse:123", "abc", "", "callbackX:1"]) expect(postingIdOf(id), id).toBeNull();
  });

  it("make the path of the posting's page", () => {
    expect(postingPath(ID)).toBe(`/jobs/${ID}`);
  });
});
