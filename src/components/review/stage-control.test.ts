import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { stageOptions, type CandidateStep, type StageChoice } from "@/lib/review/stages";
import { COMPACT_BUTTON_LIMIT, StageControl, StageDot } from "./stage-control";

const step = (index: number): CandidateStep => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  position: index,
  name: `Step ${index}`,
  description: "text",
  usedAt: null,
  updatedAt: "2026-11-09T10:00:00+00:00",
  schedulesInterview: false,
});

const steps = (count: number) => Array.from({ length: count }, (_, index) => step(index + 1));
const APPLIED: StageChoice = { stage: "APPLIED", stepId: null };

const render = (count: number, stage: StageChoice, compact = false) =>
  renderToStaticMarkup(
    createElement(StageControl, { options: stageOptions(steps(count)), stage, onChange: vi.fn(), compact }),
  );

describe("StageControl", () => {
  it("has a button for Applied, each step, Offer and Rejected", () => {
    const html = render(2, APPLIED);

    expect(html).toContain('aria-label="Status"');
    for (const label of ["Applied", "Step 1", "Step 2", "Offer", "Rejected"]) {
      expect(html, label).toContain(`>${label}</span>`);
    }
    expect(html.match(/<button/g)).toHaveLength(5);
  });

  it("shows each key", () => {
    const html = render(2, APPLIED);

    for (const key of ["A", "1", "2", "O", "R"]) expect(html, key).toContain(`<kbd`);
    expect(html.match(/<kbd/g)).toHaveLength(5);
  });

  it("marks the chosen status, and only that one", () => {
    const html = render(2, { stage: "STEP", stepId: step(2).id });

    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*title="Step 2"/);
  });

  it("is two buttons wide on desktop and three on a phone", () => {
    expect(render(2, APPLIED)).toContain("grid-cols-2");
    expect(render(2, APPLIED, true)).toContain("grid-cols-3");
  });

  it("has no keys in the phone bar", () => {
    expect(render(2, APPLIED, true)).not.toContain("<kbd");
  });

  it("scrolls when there are many steps rather than pushing Next off screen", () => {
    expect(render(10, APPLIED)).toContain("overflow-y-auto");
    expect(render(1, APPLIED)).not.toContain("overflow-y-auto");
  });

  it("is a select in the phone bar once there are too many buttons for it", () => {
    const options = stageOptions(steps(COMPACT_BUTTON_LIMIT));
    expect(options.length).toBeGreaterThan(COMPACT_BUTTON_LIMIT);

    const html = render(COMPACT_BUTTON_LIMIT, APPLIED, true);
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain("aria-pressed");
  });

  it("keeps the buttons in the phone bar while they fit", () => {
    const html = render(COMPACT_BUTTON_LIMIT - 3, APPLIED, true);
    expect(html).toContain("aria-pressed");
    expect(html).not.toContain('role="combobox"');
  });

  it("gives a long name its full text as a title", () => {
    const long = { ...step(1), name: "A very long step name that will be cut off" };
    const html = renderToStaticMarkup(
      createElement(StageControl, { options: stageOptions([long]), stage: APPLIED, onChange: vi.fn() }),
    );

    expect(html).toContain('title="A very long step name that will be cut off"');
  });
});

describe("StageDot", () => {
  it("is red for Rejected and not for the others", () => {
    expect(renderToStaticMarkup(createElement(StageDot, { stage: "REJECTED" }))).toContain("bg-red-400");
    expect(renderToStaticMarkup(createElement(StageDot, { stage: "STEP" }))).not.toContain("bg-red-400");
    expect(renderToStaticMarkup(createElement(StageDot, { stage: "APPLIED" }))).toContain("aria-hidden");
  });
});
