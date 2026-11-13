import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FetchJson } from "@/lib/jobs/load";
import type { JobListItem } from "@/lib/jobs/types";
import { useJobList } from "./use-job-list";

const JOB: JobListItem = {
  id: "greenhouse:42",
  title: "Backend Engineer",
  companyName: "Elsewhere",
  locationRaw: null,
  department: null,
  workMode: null,
  postedAt: null,
  firstSeenAt: "2026-11-01T00:00:00.000Z",
  url: null,
  source: "greenhouse",
  active: true,
};

// Renders a component that prints what the hook answers on its first render, which is all a render
// on the server (no effects, no state updates) can show.
function firstRender(fetchJson: FetchJson, providedJobs?: JobListItem[]) {
  function Probe() {
    const { jobs, now, status } = useJobList(fetchJson, providedJobs);
    return createElement("p", null, JSON.stringify({ jobs: jobs?.map((job) => job.id) ?? null, now: now ?? null, status }));
  }
  return JSON.parse(renderToStaticMarkup(createElement(Probe)).replace(/<\/?p>/g, "").replaceAll("&quot;", '"'));
}

describe("useJobList", () => {
  it("starts out loading, with no jobs and no clock, when the page didn't bring the list", () => {
    const fetchJson = vi.fn();

    expect(firstRender(fetchJson)).toEqual({ jobs: null, now: null, status: "loading" });
  });

  it("is ready at once with the list a page passes in, and leaves the clock to that page", () => {
    const fetchJson = vi.fn();

    expect(firstRender(fetchJson, [JOB])).toEqual({ jobs: ["greenhouse:42"], now: null, status: "ready" });
  });

  it("doesn't ask for the list while rendering: it loads once the explorer is up in the browser", () => {
    const fetchJson = vi.fn();

    firstRender(fetchJson);

    expect(fetchJson).not.toHaveBeenCalled();
  });
});
