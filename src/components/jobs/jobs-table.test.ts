import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { JobListItem } from "@/lib/jobs/types";
import { JobsTable, type JobsTableProps } from "./jobs-table";

const NOW = Date.parse("2026-11-04T00:00:00.000Z");

function job(overrides: Partial<JobListItem> = {}): JobListItem {
  return {
    id: "greenhouse:1",
    title: "Backend Engineer",
    companyName: "Acme Corp",
    locationRaw: "Belgrade",
    department: null,
    workMode: "REMOTE",
    postedAt: "2026-11-01T00:00:00.000Z",
    firstSeenAt: "2026-11-01T00:00:00.000Z",
    url: "https://example.com/1",
    source: "greenhouse",
    active: true,
    ...overrides,
  };
}

function tableProps(overrides: Partial<JobsTableProps> = {}): JobsTableProps {
  return {
    rows: [job()],
    matchCount: 1,
    totalCount: 1,
    page: 1,
    pageCount: 1,
    pageSize: 20,
    sort: "posted",
    direction: "desc",
    showApplied: false,
    appliedIds: new Set(),
    pendingAppliedId: null,
    appliedErrors: {},
    showSaved: false,
    savedIds: new Set(),
    pendingSavedIds: new Set(),
    savedErrors: {},
    loading: false,
    now: NOW,
    ...overrides,
  };
}

const render = (overrides: Partial<JobsTableProps> = {}) =>
  renderToStaticMarkup(createElement(JobsTable, tableProps(overrides)));

type RenderedCell = { classes: string[]; content: string };

// The cells of the table's body rows, with their classes split into tokens: the markup is a string
// here, and checking a token is more exact than looking for a piece of text in the class list.
function bodyCells(html: string): RenderedCell[] {
  const body = html.slice(html.indexOf("<tbody"));
  return [...body.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)].map(([, attributes, content]) => ({
    classes: (/class="([^"]*)"/.exec(attributes)?.[1] ?? "").split(/\s+/),
    content,
  }));
}

function cellWith(html: string, text: string): RenderedCell {
  const cell = bodyCells(html).find((candidate) => candidate.content.includes(text));
  if (!cell) throw new Error(`No cell with "${text}" in the markup`);
  return cell;
}

describe("JobsTable, the Posted cell on a card", () => {
  it("is not hidden on a card any more", () => {
    const html = render();

    expect(cellWith(html, "3 days ago").classes).not.toContain("max-md:hidden");
  });

  it("is the fourth line of the card, in the first column, under Company", () => {
    const html = render();

    const posted = cellWith(html, "3 days ago").classes;
    const company = cellWith(html, "Acme Corp").classes;

    expect(posted).toContain("max-md:col-start-1");
    expect(posted).toContain("max-md:row-start-4");
    expect(company).toContain("max-md:row-start-3");
  });

  it("is muted on a card, like the Company line", () => {
    const html = render();

    expect(cellWith(html, "3 days ago").classes).toContain("max-md:text-muted-foreground");
    expect(cellWith(html, "Acme Corp").classes).toContain("text-muted-foreground");
  });

  it("keeps the same place when the Applied and Save job columns are there", () => {
    const html = render({ showApplied: true, showSaved: true });

    const posted = cellWith(html, "3 days ago").classes;

    expect(posted).toContain("max-md:col-start-1");
    expect(posted).toContain("max-md:row-start-4");
  });

  it("leads the date with the word Posted, which the cell hides from md up", () => {
    const html = render();

    expect(cellWith(html, "3 days ago").content).toContain('<span class="md:hidden">Posted </span>3 days ago');
    expect(cellWith(html, "3 days ago").classes).not.toContain("md:hidden");
  });

  it("shows a date, still led by Posted, on the static page that has no clock", () => {
    const html = render({ now: undefined });

    expect(cellWith(html, "1 Nov 2026").content).toContain('<span class="md:hidden">Posted </span>1 Nov 2026');
  });
});

describe("JobsTable, the cells that stay out of a card", () => {
  it("hides Location and Source on a card", () => {
    const html = render();

    expect(cellWith(html, "Belgrade").classes).toContain("max-md:hidden");
    expect(cellWith(html, "Greenhouse").classes).toContain("max-md:hidden");
  });
});
