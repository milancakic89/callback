import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The actions pull in the server (Supabase, rate limiting); the form only needs them to exist.
vi.mock("@/app/(employer)/[company]/actions", () => ({ createJobPosting: vi.fn(), updateJobPosting: vi.fn() }));

import type { CandidateStep } from "@/lib/review/stages";
import { JobEditor } from "./job-editor";

const SCREENING: CandidateStep = {
  id: "11111111-1111-4111-8111-111111111111",
  position: 1,
  name: "Screening",
  description: "We read it.",
  usedAt: null,
  updatedAt: "2026-11-09T10:00:00+00:00",
  schedulesInterview: false,
};

const render = (candidateSteps: CandidateStep[]) =>
  renderToStaticMarkup(
    createElement(JobEditor, { companyName: "Acme", companySlug: "acme", companyProfile: null, candidateSteps }),
  );

describe("JobEditor", () => {
  it("offers to add candidate steps when the company has none", () => {
    const html = render([]);

    expect(html).toContain("Add candidate steps");
    expect(html).toContain('href="/acme/settings"');
  });

  it("shows the company's steps once it has some", () => {
    const html = render([SCREENING]);

    expect(html).not.toContain("Add candidate steps");
    expect(html).toContain("Screening");
  });

  it("still has the job form", () => {
    const html = render([]);

    expect(html).toContain("Save job");
    expect(html).toContain('name="title"');
  });
});
