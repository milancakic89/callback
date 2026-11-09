import { describe, expect, it } from "vitest";
import type { CallbackStatus } from "@/lib/cvs/types";
import { candidateStatusView } from "./candidate-status";

const status = (fields: Partial<CallbackStatus>): CallbackStatus => ({
  stage: "STEP",
  stepName: "Interview",
  stepDescription: "A short call with our recruiter.",
  stageAt: "2026-11-09T10:00:00+00:00",
  stepUpdatedAt: "2026-11-01T10:00:00+00:00",
  ...fields,
});

describe("candidateStatusView", () => {
  it("reads Applied, Got offer and Rejected with no text, whatever the step columns hold", () => {
    expect(candidateStatusView(status({ stage: "APPLIED", stepName: null, stepDescription: null }))).toEqual({
      label: "Applied",
      description: null,
      editedAt: null,
    });
    expect(candidateStatusView(status({ stage: "OFFER", stepName: null, stepDescription: null })).label).toBe("Got offer");
    expect(candidateStatusView(status({ stage: "REJECTED", stepName: null, stepDescription: null })).label).toBe("Rejected");
  });

  it("reads a step as the company's name and text", () => {
    expect(candidateStatusView(status({}))).toEqual({
      label: "Interview",
      description: "A short call with our recruiter.",
      editedAt: null,
    });
  });

  it("says when the step was edited after the candidate was moved to it", () => {
    const view = candidateStatusView(status({ stepUpdatedAt: "2026-11-12T08:00:00+00:00" }));

    expect(view.editedAt).toBe("2026-11-12T08:00:00+00:00");
  });

  it("does not say it for a step edited before the candidate was moved to it, or at the same time", () => {
    expect(candidateStatusView(status({ stepUpdatedAt: "2026-11-09T10:00:00+00:00" })).editedAt).toBeNull();
    expect(candidateStatusView(status({ stepUpdatedAt: "2026-11-01T10:00:00+00:00" })).editedAt).toBeNull();
  });

  it("compares times, not the way they are written", () => {
    // The same instant as stageAt, written in another zone.
    expect(candidateStatusView(status({ stepUpdatedAt: "2026-11-09T11:00:00+01:00" })).editedAt).toBeNull();
  });

  it("does not say it when a time is missing", () => {
    expect(candidateStatusView(status({ stageAt: null })).editedAt).toBeNull();
    expect(candidateStatusView(status({ stepUpdatedAt: null })).editedAt).toBeNull();
  });

  it("falls back to a plain label for a step that has no name", () => {
    expect(candidateStatusView(status({ stepName: null, stepDescription: null }))).toMatchObject({
      label: "In progress",
      description: null,
    });
  });
});
