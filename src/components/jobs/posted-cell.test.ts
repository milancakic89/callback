import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobListItem } from "@/lib/jobs/types";
import { PostedCell } from "./posted-cell";

const NOW = Date.parse("2026-11-04T00:00:00.000Z");
// The word that leads the date on a card, and is display:none from `md` up.
const POSTED_WORD = '<span class="md:hidden">Posted </span>';

function job(overrides: Partial<JobListItem> = {}): JobListItem {
  return {
    id: "greenhouse:1",
    title: "Backend Engineer",
    companyName: "Company",
    locationRaw: "Belgrade",
    department: null,
    workMode: "REMOTE",
    postedAt: "2026-11-01T00:00:00.000Z",
    firstSeenAt: "2026-11-02T00:00:00.000Z",
    url: "https://example.com/1",
    source: "greenhouse",
    active: true,
    ...overrides,
  };
}

const render = (props: { job: JobListItem; now?: number }) => renderToStaticMarkup(createElement(PostedCell, props));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PostedCell, with a clock and a posted date", () => {
  it("shows the relative date, led by the word Posted that only a card shows", () => {
    const html = render({ job: job(), now: NOW });

    expect(html).toBe(`<span>${POSTED_WORD}3 days ago</span>`);
  });

  it("reads Posted yesterday for a job posted a day ago", () => {
    const html = render({ job: job({ postedAt: "2026-11-03T00:00:00.000Z" }), now: NOW });

    expect(html).toContain(`${POSTED_WORD}yesterday`);
  });

  it("is not muted by itself, and has no tooltip", () => {
    const html = render({ job: job(), now: NOW });

    expect(html).not.toContain("text-muted-foreground");
    expect(html).not.toContain("tooltip-trigger");
  });
});

describe("PostedCell, with a clock and no posted date", () => {
  const withoutPostedDate = job({ postedAt: null, firstSeenAt: "2026-11-02T00:00:00.000Z" });

  it("shows when the scraper first saw the job, muted, led by the word Posted", () => {
    const html = render({ job: withoutPostedDate, now: NOW });

    expect(html).toContain('class="text-muted-foreground"');
    expect(html).toContain(`${POSTED_WORD}2 days ago`);
  });

  it("is the trigger of the First seen tooltip, whose text stays out of the page until it is hovered", () => {
    const html = render({ job: withoutPostedDate, now: NOW });

    expect(html).toContain('data-slot="tooltip-trigger"');
    expect(html).not.toContain("First seen");
  });
});

describe("PostedCell, without a clock (the static page)", () => {
  it("shows the posted date as a date, led by the word Posted", () => {
    const html = render({ job: job() });

    expect(html).toBe(`<span>${POSTED_WORD}1 Nov 2026</span>`);
  });

  it("shows the first-seen date when there is no posted date", () => {
    const html = render({ job: job({ postedAt: null, firstSeenAt: "2026-11-02T00:00:00.000Z" }) });

    expect(html).toContain(`${POSTED_WORD}2 Nov 2026`);
  });

  it("never reads the clock, which a prerender must not do", () => {
    const clock = vi.spyOn(Date, "now");

    render({ job: job() });

    expect(clock).not.toHaveBeenCalled();
    expect(render({ job: job() })).not.toContain("ago");
  });
});
