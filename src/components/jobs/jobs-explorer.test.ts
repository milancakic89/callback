import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { urlQuery } = vi.hoisted(() => ({ urlQuery: { current: "" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(urlQuery.current),
}));
// The actions pull in the server (Supabase, rate limiting); the explorer only needs them to exist.
vi.mock("@/app/(app)/dashboard/actions", () => ({ markApplied: vi.fn(), setSaved: vi.fn() }));

import { encodeFilters, type FilterRule } from "@/lib/jobs/filter-schema";
import type { JobListItem } from "@/lib/jobs/types";
import { JobsExplorer, type JobsExplorerProps } from "./jobs-explorer";

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
const NOW = Date.parse("2026-11-04T00:00:00.000Z");

const render = (props: Partial<JobsExplorerProps>) => renderToStaticMarkup(createElement(JobsExplorer, props));
const renderPreview = (props: Partial<JobsExplorerProps> = {}) =>
  render({ previewRows: PREVIEW, totalCount: 6351, ...props });

function queryWith(params: { q?: string; sort?: string; rules?: FilterRule[] }): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.sort) query.set("sort", params.sort);
  const encoded = params.rules ? encodeFilters(params.rules) : null;
  if (encoded) query.set("f", encoded);
  return query.toString();
}

beforeEach(() => {
  urlQuery.current = "";
});

describe("JobsExplorer, without the job list (/jobs and /dashboard)", () => {
  it("shows the preview rows and the real job count while the list loads", () => {
    const html = renderPreview();

    expect(html).toContain("Backend Engineer 0");
    expect(html).toContain("Backend Engineer 19");
    expect(html).toContain("1–20");
    expect(html).toContain(">6351<");
    expect(html).toContain("6351 total");
    expect(html).not.toContain("Loading…");
  });

  it("shows the posted date as a date, because the clock comes from the browser once the list has arrived", () => {
    const html = renderPreview();

    expect(html).toContain("1 Nov 2026");
    expect(html).not.toContain("ago");
  });

  it("doesn't fetch anything while rendering: not the list, and above all not the descriptions", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    renderPreview();

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("waits, with the table's skeleton, rather than showing preview rows for a search", () => {
    urlQuery.current = queryWith({ q: "designer" });

    const html = renderPreview();

    expect(html).toContain("Loading…");
    expect(html).not.toContain("Backend Engineer 0");
  });

  it("waits for another sort too: the preview rows are only the newest first", () => {
    urlQuery.current = queryWith({ sort: "title.asc" });

    const html = renderPreview();

    expect(html).toContain("Loading…");
    expect(html).not.toContain("Backend Engineer 0");
  });

  it("waits for a filter from the URL, a Description one included, and says the descriptions are loading", () => {
    urlQuery.current = queryWith({
      rules: [{ id: "rule-1", field: "description", operator: "contains_any", values: ["react"] }],
    });

    const html = renderPreview();

    expect(html).toContain("Loading…");
    expect(html).toContain("loading descriptions…");
    expect(html).not.toContain("Backend Engineer 0");
  });

  it("doesn't wait for a filter that has nothing to look for yet", () => {
    urlQuery.current = queryWith({
      rules: [{ id: "rule-1", field: "description", operator: "contains_any", values: [] }],
    });

    const html = renderPreview();

    expect(html).toContain("Backend Engineer 0");
    expect(html).not.toContain("loading descriptions…");
  });

  it("shows no list error before there has been a request to fail", () => {
    expect(renderPreview()).not.toContain("Couldn&#x27;t load the job list.");
  });

  it("shows the Applied and Save job columns, with the ids the page passes, on /dashboard", () => {
    const html = renderPreview({
      showApplied: true,
      initialAppliedIds: ["greenhouse:3"],
      showSaved: true,
      initialSavedIds: ["greenhouse:4"],
    });

    expect(html).toContain("Save job");
    expect(html).toContain("Applied");
  });
});

describe("JobsExplorer, with a list from its page (/saved-jobs)", () => {
  it("shows that list at once, counted from it, with the page's clock", () => {
    const html = render({ jobs: [job(1), job(2), job(3)], now: NOW });

    expect(html).toContain("Backend Engineer 1");
    expect(html).toContain("Backend Engineer 3");
    expect(html).toContain("1–3");
    expect(html).toContain("3 total");
    expect(html).toContain("3 days ago");
  });

  it("filters that list by the URL's search with no wait", () => {
    urlQuery.current = queryWith({ q: "engineer 2" });

    const html = render({ jobs: [job(1), job(2), job(3)], now: NOW });

    expect(html).toContain("Backend Engineer 2");
    expect(html).not.toContain("Backend Engineer 1");
    expect(html).not.toContain("Loading…");
  });

  it("offers Browse jobs when nothing is saved", () => {
    const html = render({ jobs: [], now: NOW, savedOnly: true, showApplied: true, showSaved: true });

    expect(html).toContain("You haven&#x27;t saved any jobs yet.");
    expect(html).toContain("Browse jobs");
  });
});
