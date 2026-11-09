import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CallbackApplicationItem, ManualApplicationItem } from "@/lib/applications/types";
import type { CallbackStatus } from "@/lib/cvs/types";
import { CallbackApplicationRow, ManualApplicationRow } from "./application-rows";

const JOB_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";

const manualItem = (fields: Partial<ManualApplicationItem> = {}): ManualApplicationItem => ({
  kind: "manual",
  jobId: "job-1",
  status: "PENDING",
  appliedAt: "2026-11-01T09:00:00+00:00",
  title: "Backend Engineer",
  companyName: "Beta",
  url: "https://example.com/job",
  active: true,
  ...fields,
});

const STEP_STATUS: CallbackStatus = {
  stage: "STEP",
  stepName: "Interview",
  stepDescription: "A short call.",
  stageAt: "2026-11-09T10:00:00+00:00",
  stepUpdatedAt: "2026-11-01T10:00:00+00:00",
};

const callbackItem = (fields: Partial<CallbackApplicationItem> = {}): CallbackApplicationItem => ({
  kind: "callback",
  id: "app-1",
  jobId: JOB_ID,
  appliedAt: "2026-11-02T09:00:00+00:00",
  title: "Product Designer",
  companyName: "Acme",
  state: "active",
  status: STEP_STATUS,
  ...fields,
});

const inTable = (row: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement("table", null, createElement("tbody", null, row)));

const renderManual = (item: ManualApplicationItem, error?: string) =>
  inTable(
    createElement(ManualApplicationRow, { item, status: item.status, error, pending: false, onStatusChange: vi.fn() }),
  );
const renderCallback = (item: CallbackApplicationItem) => inTable(createElement(CallbackApplicationRow, { item }));

describe("CallbackApplicationRow", () => {
  it("is picked out like a Callback job on the job board: the lime row, a bold title, the Auto-tracked badge", () => {
    const html = renderCallback(callbackItem());

    expect(html).toContain("bg-primary/40");
    expect(html).toContain("font-semibold");
    expect(html).toContain("Auto-tracked");
  });

  it("opens the job's own page in the same tab", () => {
    const html = renderCallback(callbackItem());

    expect(html).toContain(`href="/jobs/${JOB_ID}"`);
    expect(html).not.toContain("target=");
  });

  it("has the same four cells as any other row: title, company, applied date, status", () => {
    const html = renderCallback(callbackItem());

    expect(html.match(/<td/g)).toHaveLength(4);
    expect(html).toContain("Product Designer");
    expect(html).toContain("Acme");
    expect(html).toContain("2 Nov 2026");
  });

  it("shows the status the company applied, with its info button, and no dropdown", () => {
    const html = renderCallback(callbackItem());

    expect(html).toContain("Interview");
    expect(html).toContain('aria-label="About the step Interview"');
    expect(html).not.toContain('role="combobox"');
  });

  it("shows Applied, with no info button, for an application nobody has moved", () => {
    const html = renderCallback(callbackItem({ status: { ...STEP_STATUS, stage: "APPLIED", stepName: null, stepDescription: null } }));

    expect(html).toContain("Applied");
    expect(html).not.toContain("About the step");
  });

  it("is the gray row of an expired job when the job isn't open, naming the state", () => {
    const html = renderCallback(callbackItem({ state: "paused" }));

    expect(html).toContain("bg-muted");
    expect(html).not.toContain("bg-primary/40");
    expect(html).toContain("Paused by the company");
    expect(html).toContain("Auto-tracked");
  });

  it("names each state that isn't open", () => {
    expect(renderCallback(callbackItem({ state: "withdrawn", status: null }))).toContain("Withdrawn by the company");
    expect(renderCallback(callbackItem({ state: "you_withdrew", status: null }))).toContain("You withdrew");
  });

  it("shows a dash for the status of an application that holds none", () => {
    const html = renderCallback(callbackItem({ state: "you_withdrew", status: null }));

    expect(html).toContain("—");
    expect(html).not.toContain("About the step");
  });

  it("shows no state badge while the application is open", () => {
    const html = renderCallback(callbackItem());

    for (const label of ["Paused by the company", "Withdrawn by the company", "You withdrew"]) {
      expect(html, label).not.toContain(label);
    }
  });

  it("has no CV, cover letter or Withdraw button: those are on the job's page", () => {
    const html = renderCallback(callbackItem());

    expect(html).not.toContain("Withdraw");
    expect(html).not.toContain("CV");
    expect(html).not.toContain("cover letter");
  });

  it("shows a title as text, never as HTML", () => {
    const html = renderCallback(callbackItem({ title: "<b>Bold</b>" }));

    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });
});

describe("ManualApplicationRow", () => {
  it("is the ordinary row with a status dropdown", () => {
    const html = renderManual(manualItem());

    expect(html).toContain("Backend Engineer");
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain("bg-primary/40");
    expect(html).not.toContain("Auto-tracked");
  });

  it("opens the job on its own site in a new tab", () => {
    const html = renderManual(manualItem());

    expect(html).toContain('href="https://example.com/job"');
    expect(html).toContain('target="_blank"');
  });

  it("is gray, with an Expired badge, when the job is taken down", () => {
    const html = renderManual(manualItem({ active: false }));

    expect(html).toContain("Expired");
    expect(html).toContain("bg-muted");
  });

  it("keeps a row with no address as plain text", () => {
    expect(renderManual(manualItem({ url: null }))).not.toContain("<a ");
  });
});
