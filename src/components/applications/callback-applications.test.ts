import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/applications/actions", () => ({ withdrawMyApplication: vi.fn() }));

import type { CallbackApplication, CallbackStatus } from "@/lib/cvs/types";
import { CallbackApplications } from "./callback-applications";

const STEP_STATUS: CallbackStatus = {
  stage: "STEP",
  stepName: "Interview",
  stepDescription: "A short call.",
  stageAt: "2026-11-09T10:00:00+00:00",
  stepUpdatedAt: "2026-11-01T10:00:00+00:00",
};

const application = (fields: Partial<CallbackApplication>): CallbackApplication => ({
  id: "app-1",
  jobId: "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f",
  title: "Product Designer",
  companyName: "Acme",
  appliedAt: "2026-11-01T09:00:00+00:00",
  state: "active",
  cvFileName: "cv.pdf",
  coverLetter: null,
  status: { stage: "APPLIED", stepName: null, stepDescription: null, stageAt: null, stepUpdatedAt: null },
  ...fields,
});

const render = (items: CallbackApplication[]) => renderToStaticMarkup(createElement(CallbackApplications, { items }));

describe("CallbackApplications", () => {
  it("shows the status the company applied next to where the application stands", () => {
    const html = render([application({ status: STEP_STATUS })]);

    expect(html).toContain("Interview");
    expect(html).toContain("Active");
    expect(html).toContain('aria-label="About the step Interview"');
  });

  it("shows Applied for an application nobody has moved", () => {
    expect(render([application({})])).toContain("Applied</span>");
  });

  it("shows no status for a withdrawn application", () => {
    const html = render([application({ state: "withdrawn", status: null, cvFileName: null })]);

    expect(html).toContain("Withdrawn by the company");
    expect(html).not.toContain("About the step");
  });

  it("keeps the withdraw button for an active application", () => {
    expect(render([application({})])).toContain("Withdraw");
  });
});
