import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CandidateInterview } from "@/lib/interviews/types";

// The answer buttons call a Server Action; this only draws the block.
vi.mock("@/app/(app)/applications/actions", () => ({ respondToMyInterview: vi.fn() }));

import { InterviewInvitation } from "./interview-invitation";

const interview = (fields: Partial<CandidateInterview> = {}): CandidateInterview => ({
  id: "inv-1",
  status: "pending",
  startsAt: "2030-01-15T10:00:00.000Z",
  durationMinutes: 45,
  timeZone: "Europe/Belgrade",
  expiresAt: "2030-01-13T10:00:00.000Z",
  message: "A short call.",
  meetUrl: null,
  ...fields,
});

const render = (value: CandidateInterview) =>
  renderToStaticMarkup(createElement(InterviewInvitation, { interview: value, companyName: "Acme" }));

describe("InterviewInvitation", () => {
  it("asks a pending invitation to be answered, with the time, the length and the company's message", () => {
    const html = render(interview());

    expect(html).toContain("Acme invited you to an interview");
    expect(html).toContain("Tuesday, 15 January 2030, 11:00 (Europe/Belgrade)");
    expect(html).toContain("45 minutes");
    expect(html).toContain("A short call.");
    expect(html).toContain("answer by 13 Jan, 11:00");
    expect(html).toContain("Confirm");
    expect(html).toContain("Decline");
  });

  it("shows the company's message as text, never as HTML", () => {
    const html = render(interview({ message: "<img src=x onerror=alert(1)>" }));

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("gives a confirmed one its Meet link and no buttons", () => {
    const html = render(interview({ status: "confirmed", meetUrl: "https://meet.google.com/abc-defg-hij" }));

    expect(html).toContain("You confirmed the interview");
    expect(html).toContain('href="https://meet.google.com/abc-defg-hij"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("Decline");
  });

  it("says a declined one is declined, with nothing to press", () => {
    const html = render(interview({ status: "declined" }));

    expect(html).toContain("You declined the interview");
    expect(html).not.toContain(">Confirm<");
  });

  it("says an unanswered one has closed", () => {
    const html = render(interview({ status: "expired" }));

    expect(html).toContain("The invitation closed with no answer");
    expect(html).toContain("The answer was due by 13 Jan, 11:00.");
    expect(html).not.toContain(">Confirm<");
  });
});
