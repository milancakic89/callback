import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { JobListItem } from "@/lib/jobs/types";
import { JobsExplorerFallback } from "./jobs-explorer-fallback";

function job(index: number, overrides: Partial<JobListItem> = {}): JobListItem {
  return {
    id: `greenhouse:${index}`,
    title: `Backend Engineer ${index}`,
    companyName: `Company ${index}`,
    locationRaw: "Belgrade",
    department: null,
    workMode: "REMOTE",
    postedAt: "2026-11-01T00:00:00.000Z",
    firstSeenAt: "2026-11-01T00:00:00.000Z",
    url: `https://example.com/${index}`,
    source: "greenhouse",
    active: true,
    ...overrides,
  };
}

const PREVIEW = Array.from({ length: 20 }, (_, index) => job(index));

function render(props: Partial<Parameters<typeof JobsExplorerFallback>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(JobsExplorerFallback, { previewRows: PREVIEW, totalCount: 6351, ...props }),
  );
}

describe("JobsExplorerFallback", () => {
  it("shows the preview rows it is given, as the first page of the table", () => {
    const html = render();

    expect(html).toContain("Backend Engineer 0");
    expect(html).toContain("Backend Engineer 19");
    expect(html).toContain("1–20");
  });

  it("counts every job from the total it is given, not from the rows", () => {
    const html = render();

    expect(html).toContain(">6351<");
    expect(html).toContain("6351 total");
  });

  it("shows the posted date as a date, since the static page has no clock", () => {
    const html = render({ previewRows: [job(1)], totalCount: 1 });

    expect(html).toContain("1 Nov 2026");
    expect(html).not.toContain("ago");
  });

  it("shows the Applied and Save job columns only when asked for them", () => {
    expect(render()).not.toContain("Save job");
    expect(render({ showApplied: true, showSaved: true })).toContain("Save job");
    expect(render({ showApplied: true, showSaved: true })).toContain("Applied");
  });

  it("is a loading skeleton for a page with no jobs to show yet", () => {
    const html = render({ previewRows: [], totalCount: 0, loading: true });

    expect(html).toContain("Loading…");
    expect(html).not.toContain("Backend Engineer");
  });

  it("keeps the filter bar's place with a disabled Add filter button", () => {
    expect(render()).toMatch(/<button[^>]*disabled[^>]*>.*Add filter/);
  });
});
