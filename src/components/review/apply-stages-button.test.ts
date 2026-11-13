import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PendingStageChange } from "@/lib/review/pending-stages";
import { stageOptions, type CandidateStep } from "@/lib/review/stages";
import { ApplyStagesButton, applyTitle, PendingChangeList } from "./apply-stages-button";

const INTERVIEW: CandidateStep = {
  id: "22222222-2222-4222-8222-222222222222",
  position: 1,
  name: "Interview",
  description: "A short call.",
  usedAt: null,
  updatedAt: "2026-11-09T10:00:00+00:00",
  schedulesInterview: false,
};
const options = stageOptions([INTERVIEW]);

const toInterview = (id: string, name: string): PendingStageChange => ({
  id,
  name,
  from: { stage: "APPLIED", stepId: null },
  to: { stage: "STEP", stepId: INTERVIEW.id },
});

const renderButton = (changes: PendingStageChange[]) =>
  renderToStaticMarkup(createElement(ApplyStagesButton, { changes, options, onApply: vi.fn() }));

describe("ApplyStagesButton", () => {
  it("is disabled while nothing is pending", () => {
    const html = renderButton([]);

    expect(html).toContain("Apply statuses");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("(0)");
  });

  it("shows how many are pending and can be pressed", () => {
    const html = renderButton([toInterview("a", "Ana Novak"), toInterview("b", "Jonas Weber")]);

    expect(html).toContain("Apply statuses");
    expect(html).toContain("(2)");
    expect(html).not.toContain('disabled=""');
  });

  it("keeps the confirmation closed until the button is pressed", () => {
    const html = renderButton([toInterview("a", "Ana Novak")]);

    expect(html).not.toContain("Apply 1 status?");
    expect(html).not.toContain("No email is sent");
  });
});

describe("applyTitle", () => {
  it("counts the statuses", () => {
    expect(applyTitle(1)).toBe("Apply 1 status?");
    expect(applyTitle(3)).toBe("Apply 3 statuses?");
  });
});

describe("PendingChangeList", () => {
  it("lists each candidate with the status they see now and the one they will see", () => {
    const html = renderToStaticMarkup(
      createElement(PendingChangeList, {
        changes: [
          toInterview("a", "Ana Novak"),
          { id: "b", name: "Jonas Weber", from: { stage: "STEP", stepId: INTERVIEW.id }, to: { stage: "REJECTED", stepId: null } },
        ],
        options,
      }),
    );

    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain("Ana Novak");
    expect(html).toMatch(/Applied[\s\S]*Interview/);
    expect(html).toMatch(/Jonas Weber[\s\S]*Interview[\s\S]*Rejected/);
  });

  it("shows a name as text, never as HTML", () => {
    const html = renderToStaticMarkup(
      createElement(PendingChangeList, { changes: [toInterview("a", "<img src=x onerror=alert(1)>")], options }),
    );

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
