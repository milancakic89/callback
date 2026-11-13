import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CandidateStep } from "@/lib/review/stages";
import { CandidateStepsNotice } from "./candidate-steps-notice";

const step = (position: number, name: string): CandidateStep => ({
  id: `00000000-0000-4000-8000-00000000000${position}`,
  position,
  name,
  description: "text",
  usedAt: null,
  updatedAt: "2026-11-09T10:00:00+00:00",
  schedulesInterview: false,
});

const render = (steps: CandidateStep[]) =>
  renderToStaticMarkup(createElement(CandidateStepsNotice, { steps, companySlug: "acme" }));

describe("CandidateStepsNotice", () => {
  it("offers a button to add candidate steps, to the settings, when there are none", () => {
    const html = render([]);

    expect(html).toContain("Add candidate steps");
    expect(html).toContain('href="/acme/settings"');
  });

  it("shows the pipeline instead, and a link to edit it, once there are steps", () => {
    const html = render([step(2, "Interview"), step(1, "Screening")]);

    expect(html).not.toContain("Add candidate steps");
    expect(html).toContain("Candidate steps:");
    expect(html).toMatch(/Applied[\s\S]*Screening[\s\S]*Interview[\s\S]*Offer/);
    expect(html).toContain('href="/acme/settings"');
    expect(html).toContain(">Edit<");
  });

  it("has an arrow between steps and not after the last", () => {
    const html = render([step(1, "Screening")]);

    // Applied → Screening → Offer
    expect(html.match(/lucide-arrow-right/g)).toHaveLength(2);
  });

  it("shows a step's name as text, never as HTML", () => {
    const html = render([step(1, "<b>Bold</b>")]);

    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });
});
