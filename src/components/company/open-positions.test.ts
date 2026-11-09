import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublishedJob } from "@/lib/jobs/published";
import { OpenPositions } from "./open-positions";

const JOB: PublishedJob = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  title: "Senior Product Designer",
  description: "Own the design.",
  locationRaw: "Belgrade, Serbia",
  workMode: "HYBRID",
  publishedAt: "2026-11-09T10:00:00.000Z",
  companyName: "Acme d.o.o.",
  companySlug: "acme",
};

const SECOND_JOB: PublishedJob = {
  ...JOB,
  id: "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f",
  title: "Backend Engineer",
  locationRaw: null,
  workMode: null,
};

const render = (jobs: PublishedJob[]) => renderToStaticMarkup(createElement(OpenPositions, { jobs }));

describe("OpenPositions", () => {
  it("counts the jobs in the heading", () => {
    expect(render([JOB, SECOND_JOB])).toContain("Open positions (2)");
  });

  it("links each job's title to its posting", () => {
    const html = render([JOB, SECOND_JOB]);

    expect(html).toContain(`href="/jobs/${JOB.id}"`);
    expect(html).toContain(`href="/jobs/${SECOND_JOB.id}"`);
    expect(html).toContain("Senior Product Designer");
    expect(html).toContain("Backend Engineer");
  });

  it("shows where, how and when for a job, with the date in UTC", () => {
    const html = render([JOB]);

    expect(html).toContain("Belgrade, Serbia");
    expect(html).toContain("Hybrid");
    expect(html).toContain("Posted 9 Nov 2026");
  });

  it("leaves out the location and the work mode a job doesn't have", () => {
    const html = render([SECOND_JOB]);

    expect(html).not.toContain("Belgrade");
    expect(html).not.toContain("—");
  });

  it("says so when there are no open positions", () => {
    const html = render([]);

    expect(html).toContain("Open positions (0)");
    expect(html).toContain("No open positions right now.");
    expect(html).not.toContain("<ul");
  });
});
