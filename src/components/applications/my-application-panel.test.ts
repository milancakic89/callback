import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/applications/actions", () => ({ withdrawMyApplication: vi.fn() }));

import type { CallbackApplication } from "@/lib/cvs/types";
import { MyApplicationPanel } from "./my-application-panel";

const application = (fields: Partial<CallbackApplication> = {}): CallbackApplication => ({
  id: "app-1",
  jobId: "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f",
  title: "Product Designer",
  companyName: "Acme",
  appliedAt: "2026-11-02T09:00:00+00:00",
  state: "active",
  cvFileName: "cv.pdf",
  coverLetter: null,
  status: {
    stage: "STEP",
    stepName: "Interview",
    stepDescription: "A short call.",
    stageAt: "2026-11-09T10:00:00+00:00",
    stepUpdatedAt: "2026-11-01T10:00:00+00:00",
  },
  interview: null,
  ...fields,
});

const render = (value: CallbackApplication) => renderToStaticMarkup(createElement(MyApplicationPanel, { application: value }));

describe("MyApplicationPanel", () => {
  it("says when the candidate applied and that the status updates by itself", () => {
    const html = render(application());

    expect(html).toContain("You applied on 2 Nov 2026");
    expect(html).toContain("Acme can read your application");
    expect(html).toContain("updates here by itself");
  });

  it("shows the status the company applied, with its info button", () => {
    const html = render(application());

    expect(html).toContain("Status");
    expect(html).toContain("Interview");
    expect(html).toContain('aria-label="About the step Interview"');
  });

  it("links the CV to the document route, in a new tab", () => {
    const html = render(application());

    expect(html).toContain("CV: cv.pdf");
    expect(html).toContain('href="/api/applications/app-1/documents/cv"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("says there is no cover letter when there isn't one", () => {
    expect(render(application())).toContain("No cover letter");
  });

  it("links a PDF cover letter to the document route", () => {
    const html = render(application({ coverLetter: { kind: "pdf" } }));

    expect(html).toContain("Cover letter (PDF)");
    expect(html).toContain('href="/api/applications/app-1/documents/cover-letter"');
    expect(html).not.toContain("No cover letter");
  });

  it("shows a typed cover letter as text, never as HTML", () => {
    const html = render(application({ coverLetter: { kind: "text", text: "<script>alert(1)</script> Hello" } }));

    expect(html).toContain("Your cover letter");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("has Withdraw while the application is active", () => {
    expect(render(application())).toContain("Withdraw");
  });

  it("says the company paused the job, and still lets the candidate withdraw", () => {
    const html = render(application({ state: "paused" }));

    expect(html).toContain("Acme has paused this job");
    expect(html).toContain("Withdraw");
    expect(html).toContain("CV: cv.pdf");
  });

  it("has no documents and no Withdraw once the company withdrew the application", () => {
    const html = render(application({ state: "withdrawn", cvFileName: null, status: null }));

    expect(html).toContain("Acme withdrew your application.");
    expect(html).not.toContain("Withdraw</button>");
    expect(html).not.toContain("CV:");
    expect(html).not.toContain("Status");
  });

  it("says the candidate withdrew it, and that they can't apply again", () => {
    const html = render(application({ state: "you_withdrew", cvFileName: null, status: null }));

    expect(html).toContain("You withdrew your application.");
    expect(html).toContain("can&#x27;t apply to this job again");
    expect(html).not.toContain("Withdraw</button>");
  });

  it("links to all the candidate's applications", () => {
    const html = render(application());

    expect(html).toContain('href="/applications"');
    expect(html).toContain("All your applications");
  });
});
