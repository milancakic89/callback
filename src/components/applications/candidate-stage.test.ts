import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CallbackStatus } from "@/lib/cvs/types";
import { CandidateStage } from "./candidate-stage";

const status = (fields: Partial<CallbackStatus>): CallbackStatus => ({
  stage: "STEP",
  stepName: "Interview",
  stepDescription: "A short call with our recruiter.",
  stageAt: "2026-11-09T10:00:00+00:00",
  stepUpdatedAt: "2026-11-01T10:00:00+00:00",
  ...fields,
});

const render = (value: CallbackStatus) => renderToStaticMarkup(createElement(CandidateStage, { status: value }));

describe("CandidateStage", () => {
  it("shows a company step by its name, with an info button for its text", () => {
    const html = render(status({}));

    expect(html).toContain("Interview");
    expect(html).toContain('aria-label="About the step Interview"');
  });

  it("keeps the text out of the page until the info button is pressed", () => {
    expect(render(status({}))).not.toContain("A short call with our recruiter.");
  });

  it("has no info button for Applied, Got offer and Rejected", () => {
    for (const stage of ["APPLIED", "OFFER", "REJECTED"] as const) {
      const html = render(status({ stage, stepName: null, stepDescription: null }));
      expect(html, stage).not.toContain("<button");
    }
  });

  it("calls the offer Got offer", () => {
    expect(render(status({ stage: "OFFER", stepName: null, stepDescription: null }))).toContain("Got offer");
  });

  it("is red for Rejected", () => {
    expect(render(status({ stage: "REJECTED", stepName: null, stepDescription: null }))).toContain("text-red-700");
  });

  it("shows a step's name as text, never as HTML", () => {
    const html = render(status({ stepName: "<script>alert(1)</script>" }));

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
