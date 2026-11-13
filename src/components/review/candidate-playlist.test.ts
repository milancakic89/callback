import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { stageOptions, type CandidateStep, type StageChoice } from "@/lib/review/stages";
import { CandidatePlaylist, type PlaylistItem } from "./candidate-playlist";

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

const APPLIED: StageChoice = { stage: "APPLIED", stepId: null };
const AT_INTERVIEW: StageChoice = { stage: "STEP", stepId: INTERVIEW.id };
const REJECTED: StageChoice = { stage: "REJECTED", stepId: null };

const item = (fields: Partial<PlaylistItem>): PlaylistItem => ({
  id: "a",
  name: "Ana Novak",
  location: "Novi Sad",
  viewed: false,
  liked: false,
  stage: APPLIED,
  pending: false,
  requiredScore: null,
  ...fields,
});

const render = (items: PlaylistItem[], stageFilter = "any", currentId = "a") =>
  renderToStaticMarkup(
    createElement(CandidatePlaylist, {
      items,
      options,
      currentId,
      filter: "all",
      onFilter: vi.fn(),
      stageFilter,
      onStageFilter: vi.fn(),
      order: null,
      onOrder: vi.fn(),
      onSelect: vi.fn(),
    }),
  );

describe("CandidatePlaylist", () => {
  it("says New for an applicant not viewed and Viewed for one that was, while they are at Applied", () => {
    const html = render([item({ id: "a" }), item({ id: "b", name: "Jonas Weber", viewed: true })]);

    expect(html).toContain(">New<");
    expect(html).toContain("Viewed");
  });

  it("shows the name of the company's step an applicant is at", () => {
    const html = render([item({ stage: AT_INTERVIEW })]);

    expect(html).toContain(">Interview<");
    expect(html).not.toContain(">New<");
  });

  it("marks a status the candidate hasn't been shown yet", () => {
    expect(render([item({ stage: AT_INTERVIEW, pending: true })])).toContain("Not applied");
    expect(render([item({ stage: AT_INTERVIEW, pending: false })])).not.toContain("Not applied");
  });

  it("marks a change back to Applied that the candidate hasn't been shown", () => {
    const html = render([item({ stage: APPLIED, pending: true })]);

    expect(html).toContain("Not applied");
    expect(html).toContain(">Applied<");
  });

  it("dims a rejected applicant", () => {
    const html = render([item({ id: "b", stage: REJECTED }), item({ id: "a" })]);

    expect(html).toContain(">Rejected<");
    expect(html).toContain("opacity-40");
  });

  it("filters by a step: the select shows its name and the count", () => {
    const html = render(
      [item({ id: "a", stage: AT_INTERVIEW }), item({ id: "b", name: "Jonas Weber" })],
      `STEP:${INTERVIEW.id}`,
    );

    expect(html).toContain("Ana Novak");
    expect(html).not.toContain("Jonas Weber");
  });

  it("says nobody is at a status when the filter matches no one", () => {
    expect(render([item({})], `STEP:${INTERVIEW.id}`)).toContain("No candidates with this status.");
  });

  it("shows the required filters met", () => {
    const html = render([item({ requiredScore: { met: 2, total: 3, unverified: 0 } })]);

    expect(html).toContain("2/3");
  });
});
