import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ExternalApplicationItem } from "@/lib/applications/types";
import { ExternalApplicationRow } from "./external-application-row";

const CV_ID = "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";

const item = (fields: Partial<ExternalApplicationItem> = {}): ExternalApplicationItem => ({
  kind: "external",
  id: "ext-1",
  source: "linkedin",
  status: "PENDING",
  appliedAt: "2026-11-03T09:00:00+00:00",
  title: "Data Engineer",
  companyName: "Gamma",
  location: "Belgrade",
  url: "https://www.linkedin.com/jobs/view/4463907148/",
  cvId: null,
  cvFileName: null,
  ...fields,
});

const render = (row: ExternalApplicationItem, options: { error?: string; pending?: boolean } = {}) =>
  renderToStaticMarkup(
    createElement(
      "table",
      null,
      createElement(
        "tbody",
        null,
        createElement(ExternalApplicationRow, {
          item: row,
          status: row.status,
          error: options.error,
          pending: options.pending ?? false,
          onStatusChange: vi.fn(),
          onRemove: vi.fn(),
        }),
      ),
    ),
  );

describe("ExternalApplicationRow", () => {
  it("opens the job on its own site in a new tab, without handing the page over", () => {
    const html = render(item());

    expect(html).toContain('href="https://www.linkedin.com/jobs/view/4463907148/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Data Engineer");
  });

  it("shows the company, where the job was found, and the day it was added", () => {
    const html = render(item({ source: "infostud", companyName: "SLVWZ d.o.o." }));

    expect(html).toContain("SLVWZ d.o.o.");
    expect(html).toContain("via Infostud");
    expect(html).toContain("3 Nov 2026");
  });

  it("names the site as written for each of the three", () => {
    expect(render(item({ source: "linkedin" }))).toContain("via LinkedIn");
    expect(render(item({ source: "helloworld" }))).toContain("via HelloWorld");
    expect(render(item({ source: "infostud" }))).toContain("via Infostud");
  });

  it("links the CV it used, to the candidate's own copy", () => {
    const html = render(item({ cvId: CV_ID, cvFileName: "ana-cv.pdf" }));

    expect(html).toContain(`href="/api/cvs/${CV_ID}"`);
    expect(html).toContain("CV: ana-cv.pdf");
  });

  it("shows no CV when none was chosen, or when it is gone", () => {
    expect(render(item())).not.toContain("CV:");
    expect(render(item({ cvId: CV_ID, cvFileName: null }))).not.toContain("CV:");
  });

  it("has a status dropdown and a Remove button, and is an ordinary row, not a Callback one", () => {
    const html = render(item());

    expect(html).toContain('aria-label="Status of &quot;Data Engineer&quot;"');
    expect(html).toContain('aria-label="Remove &quot;Data Engineer&quot; from your applications"');
    expect(html).not.toContain("Auto-tracked");
    expect(html).not.toContain("bg-primary/40");
  });

  it("marks the status invalid, and keeps the error out of the markup until it is hovered", () => {
    const html = render(item(), { error: "Could not save. Try again." });

    expect(html).toContain('aria-invalid="true"');
  });

  it("holds the dropdown and the Remove button while the row is saving", () => {
    const html = render(item(), { pending: true });

    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
    expect(render(item()).match(/disabled=""/g)).toBeNull();
  });

  it("shows the page's text as text", () => {
    const html = render(item({ title: "<script>alert(1)</script>", companyName: "<img src=x onerror=alert(1)>" }));

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
