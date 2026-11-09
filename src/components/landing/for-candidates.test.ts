import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { JobListItem } from "@/lib/jobs/types";
import { ForCandidates } from "./for-candidates";

function job(id: string, title: string, source: string): JobListItem {
  return {
    id,
    title,
    companyName: `${title} Inc`,
    locationRaw: "Belgrade, Serbia",
    department: null,
    workMode: "HYBRID",
    postedAt: "2026-11-09T10:00:00.000Z",
    firstSeenAt: "2026-11-09T10:00:00.000Z",
    url: null,
    source,
    active: true,
  };
}

function render(jobs: JobListItem[]) {
  return renderToStaticMarkup(createElement(ForCandidates, { openRoles: "1,284", jobs }));
}

describe("the job board preview on the landing page", () => {
  const html = render([
    job("callback:7c9e6679-7425-40de-944b-e07fc1f90ae7", "Posted Designer", "callback"),
    job("greenhouse:1", "Scraped Engineer", "greenhouse"),
    job("greenhouse:2", "Scraped Analyst", "greenhouse"),
    job("greenhouse:3", "Scraped Manager", "greenhouse"),
  ]);

  const rowOf = (title: string) => html.split("<li").find((row) => row.includes(title)) ?? "";

  it("marks a job posted on Callback as Auto-tracked, and nothing else", () => {
    expect(rowOf("Posted Designer")).toContain("Auto-tracked");
    expect(html.match(/Auto-tracked/g)).toHaveLength(1);
  });

  it("gives a posted job no heart (it is applied to on its own page, not saved) and no sample Applied pill", () => {
    expect(rowOf("Posted Designer")).not.toContain("lucide-heart");
    expect(rowOf("Posted Designer")).not.toContain("Applied");
    expect(rowOf("Scraped Engineer")).toContain("lucide-heart");
  });

  it("keeps the illustrative Applied pill on the third row when that row is a scraped job", () => {
    expect(rowOf("Scraped Analyst")).toContain("Applied · Pending");
  });

  it("offers applying with a CV, and promises nothing about status updates", () => {
    expect(html).toContain("Apply with your CV");
    expect(html).not.toMatch(/updates automatically|status updates|we.ll tell you/i);
  });

  it("shows the live count", () => {
    expect(html).toContain("1,284");
  });
});
