import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveCandidateSteps } = vi.hoisted(() => ({ saveCandidateSteps: vi.fn() }));

// The action pulls in the server (Supabase, rate limiting); the form only needs it to exist.
vi.mock("@/app/(employer)/[company]/(workspace)/settings/actions", () => ({ saveCandidateSteps }));

import type { CandidateStep } from "@/lib/review/stages";
import { CandidateStepsEditor } from "./candidate-steps-editor";

const step = (position: number, name: string, usedAt: string | null = null): CandidateStep => ({
  id: `00000000-0000-4000-8000-00000000000${position}`,
  position,
  name,
  description: `About ${name}`,
  usedAt,
  updatedAt: "2026-11-09T10:00:00+00:00",
  schedulesInterview: false,
});

const render = (steps: CandidateStep[]) =>
  renderToStaticMarkup(createElement(CandidateStepsEditor, { steps, companySlug: "acme" }));

beforeEach(() => vi.clearAllMocks());

describe("CandidateStepsEditor", () => {
  it("shows Applied first and Offer and Rejected last, with nothing between for a company without steps", () => {
    const html = render([]);

    expect(html.indexOf("Applied")).toBeLessThan(html.indexOf("Offer"));
    expect(html.indexOf("Offer")).toBeLessThan(html.indexOf("Rejected"));
    expect(html).toContain("0 of 10 steps");
    expect(html).not.toContain("Step 1 name");
  });

  it("starts with the saved steps in their order, and sends them whole in a hidden field", () => {
    const html = render([step(2, "Interview"), step(1, "Screening")]);

    expect(html.indexOf("Screening")).toBeLessThan(html.indexOf("Interview"));
    expect(html).toContain("2 of 10 steps");
    expect(html).toContain('name="steps"');
    expect(html).toContain("&quot;name&quot;:&quot;Screening&quot;");
    expect(html).toContain("&quot;id&quot;:&quot;00000000-0000-4000-8000-000000000001&quot;");
  });

  it("locks the removal of a step that has been used", () => {
    const html = render([step(1, "Screening", "2026-11-09T10:00:00+00:00"), step(2, "Interview")]);

    expect(html.match(/An application has been on this step/g)).toHaveLength(1);
  });

  it("allows adding a step until there are 10", () => {
    const some = render([step(1, "A")]);
    expect(some).not.toMatch(/disabled=""[^>]*><svg[^>]*lucide-plus/);

    const ten = Array.from({ length: 10 }, (_, index) => step(index + 1, `Step ${index + 1}`));
    const full = render(ten);
    expect(full).toContain("10 of 10 steps");
    expect(full).toMatch(/disabled=""[^>]*><svg[^>]*lucide-plus/);
  });

  it("explains that candidates see a step only after statuses are applied", () => {
    expect(render([])).toContain("only after you apply statuses on the review screen");
  });

  it("has a Save button and a way back to the dashboard", () => {
    const html = render([]);

    expect(html).toContain("Save steps");
    expect(html).toContain("Back to dashboard");
    expect(html).toContain('href="/acme"');
  });
});
