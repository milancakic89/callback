import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GoogleStatus, Interview } from "@/lib/interviews/types";
import type { StageChoice } from "@/lib/review/stages";

// The panel's buttons call Server Actions; this only draws it.
vi.mock("@/app/(employer)/[company]/actions", () => ({ cancelInterview: vi.fn(), inviteToInterview: vi.fn() }));

import { InterviewPanel } from "./interview-panel";

const STEP_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_STEP_ID = "33333333-3333-4333-8333-333333333333";
const CONNECTED: GoogleStatus = { configured: true, connected: true, email: "boss@acme.example", broken: false };

const interview = (fields: Partial<Interview> = {}): Interview => ({
  id: "inv-1",
  status: "pending",
  startsAt: "2030-01-15T10:00:00.000Z",
  durationMinutes: 45,
  timeZone: "Europe/Belgrade",
  expiresAt: "2030-01-13T10:00:00.000Z",
  respondedAt: null,
  meetUrl: "https://meet.google.com/abc-defg-hij",
  ...fields,
});

const render = (props: { stage?: StageChoice; interview?: Interview | null } = {}) =>
  renderToStaticMarkup(
    createElement(InterviewPanel, {
      applicationId: "app-1",
      candidateName: "Ana Novak",
      candidateStage: props.stage ?? { stage: "STEP", stepId: STEP_ID },
      interview: props.interview === undefined ? null : props.interview,
      interviewStepIds: new Set([STEP_ID]),
      google: CONNECTED,
      settingsHref: "/acme/settings",
      onChange: vi.fn(),
      onNotice: vi.fn(),
    }),
  );

describe("InterviewPanel", () => {
  it("is not there for a candidate who isn't on an interview step and has no invitation", () => {
    expect(render({ stage: { stage: "STEP", stepId: OTHER_STEP_ID } })).toBe("");
    expect(render({ stage: { stage: "APPLIED", stepId: null } })).toBe("");
    expect(render({ stage: { stage: "REJECTED", stepId: null } })).toBe("");
  });

  it("offers an invitation to a candidate on an interview step who has none", () => {
    const html = render();

    expect(html).toContain("Interview");
    expect(html).toContain("No invitation has been sent to Ana Novak yet.");
    expect(html).toContain("Send invitation");
    expect(html).not.toContain("Cancel interview");
  });

  it("shows a waiting invitation with its deadline, its Meet link and a way to cancel it", () => {
    const html = render({ interview: interview() });

    expect(html).toContain("Waiting for an answer");
    expect(html).toContain("Tuesday, 15 January 2030, 11:00 (Europe/Belgrade)");
    expect(html).toContain("45 minutes");
    expect(html).toContain("until 13 Jan, 11:00");
    expect(html).toContain('href="https://meet.google.com/abc-defg-hij"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Cancel interview");
    expect(html).not.toContain("Send invitation");
  });

  it("shows a confirmed one with when they answered", () => {
    const html = render({ interview: interview({ status: "confirmed", respondedAt: "2030-01-11T09:00:00.000Z" }) });

    expect(html).toContain("Confirmed");
    expect(html).toContain("Answered 11 Jan, 10:00");
    expect(html).toContain("Cancel interview");
  });

  it("offers a new invitation after a decline or no answer, with no Meet link or cancel", () => {
    for (const status of ["declined", "expired"] as const) {
      const html = render({ interview: interview({ status }) });

      expect(html, status).toContain("Send a new invitation");
      expect(html, status).not.toContain("Cancel interview");
      expect(html, status).not.toContain("meet.google.com");
    }
    expect(render({ interview: interview({ status: "expired" }) })).toContain("No response");
  });

  it("keeps showing an answered invitation after the candidate has been moved off the interview step", () => {
    const html = render({ stage: { stage: "REJECTED", stepId: null }, interview: interview({ status: "declined" }) });

    expect(html).toContain("Declined");
    expect(html).not.toContain("Send a new invitation");
  });
});
