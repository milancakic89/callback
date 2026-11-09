import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/applications/actions", () => ({ setApplicationStatus: vi.fn() }));

import type { ApplicationListItem } from "@/lib/applications/types";
import { ApplicationsTable, ApplicationsTableFallback } from "./applications-table";

const manual: ApplicationListItem = {
  kind: "manual",
  jobId: "job-1",
  status: "PENDING",
  appliedAt: "2026-11-01T09:00:00+00:00",
  title: "Backend Engineer",
  companyName: "Beta",
  url: "https://example.com/job",
  active: true,
};

const callback: ApplicationListItem = {
  kind: "callback",
  id: "app-1",
  jobId: "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f",
  appliedAt: "2026-11-02T09:00:00+00:00",
  title: "Product Designer",
  companyName: "Acme",
  state: "active",
  status: { stage: "APPLIED", stepName: null, stepDescription: null, stageAt: null, stepUpdatedAt: null },
};

const render = (items: ApplicationListItem[]) => renderToStaticMarkup(createElement(ApplicationsTable, { items }));

describe("ApplicationsTable", () => {
  it("lists a Callback application and a job tracked by hand in the same table", () => {
    const html = render([manual, callback]);

    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).toContain("Backend Engineer");
    expect(html).toContain("Product Designer");
    expect(html).toContain("Showing");
    expect(html).toContain(">2<");
  });

  it("has the four columns", () => {
    const html = render([manual, callback]);

    for (const column of ["Label", "Company", "Applied", "Status"]) expect(html, column).toContain(column);
  });

  it("picks the Callback row out, and gives only the other row a status dropdown", () => {
    const html = render([manual, callback]);

    expect(html).toContain("Auto-tracked");
    expect(html).toContain("bg-primary/40");
  });

  it("adds a status dropdown for a job tracked by hand and none for a Callback application", () => {
    const comboboxes = (items: ApplicationListItem[]) => render(items).match(/role="combobox"/g)?.length ?? 0;

    // The sort and page size selects are there either way.
    expect(comboboxes([manual])).toBe(comboboxes([callback]) + 1);
    expect(comboboxes([manual, callback])).toBe(comboboxes([manual]));
  });

  it("shows the newest first, as the table did before", () => {
    const html = render([manual, callback]);

    expect(html.indexOf("Product Designer")).toBeLessThan(html.indexOf("Backend Engineer"));
  });

  it("shows only Callback applications when that is all there is", () => {
    const html = render([callback]);

    expect(html).toContain("Product Designer");
    expect(html).not.toContain("You haven&#x27;t applied to any jobs yet.");
  });

  it("says nothing has been applied to when there is nothing, with a way to the jobs", () => {
    const html = render([]);

    expect(html).toContain("You haven&#x27;t applied to any jobs yet.");
    expect(html).toContain("Browse jobs");
    expect(html).toContain('href="/dashboard"');
  });

  it("lists a withdrawn Callback application like an expired job", () => {
    const html = render([{ ...callback, state: "you_withdrew", status: null }]);

    expect(html).toContain("You withdrew");
    expect(html).toContain("bg-muted");
  });
});

describe("ApplicationsTableFallback", () => {
  it("is the header band while loading", () => {
    const html = renderToStaticMarkup(createElement(ApplicationsTableFallback));

    expect(html).toContain("Loading…");
    expect(html).toContain("Label");
  });
});
