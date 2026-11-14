import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InvitationView } from "@/lib/interviews/respond";

// The form posts to a Server Action; this only draws the page.
vi.mock("@/app/interviews/[invitationId]/actions", () => ({ respondToInterview: vi.fn() }));

import { InterviewResponse } from "./interview-response";

const view = (fields: Partial<InvitationView> = {}): InvitationView => ({
  id: "inv-1",
  state: "pending",
  companyName: "Acme",
  jobTitle: "Product Designer",
  startsAt: "2030-01-15T10:00:00.000Z",
  durationMinutes: 45,
  timeZone: "Europe/Belgrade",
  message: "A short call.",
  expiresAt: "2030-01-13T10:00:00.000Z",
  meetUrl: null,
  organizerEmail: null,
  ...fields,
});

const render = (value: InvitationView) => renderToStaticMarkup(createElement(InterviewResponse, { initial: value, token: "the-token" }));

describe("InterviewResponse", () => {
  it("shows an open invitation with Confirm and Decline, and the token in the form", () => {
    const html = render(view());

    expect(html).toContain("You&#x27;re invited to an interview");
    expect(html).toContain("Product Designer at Acme");
    expect(html).toContain("Tuesday, 15 January 2030, 11:00 (Europe/Belgrade)");
    expect(html).toContain("45 minutes, on Google Meet");
    expect(html).toContain("A message from Acme");
    expect(html).toContain("Please answer by 13 Jan, 11:00");
    // Each button sends its own value as `response` (the attributes come out in either order).
    expect(html).toMatch(/<button(?=[^>]*value="confirm")(?=[^>]*name="response")[^>]*>/);
    expect(html).toMatch(/<button(?=[^>]*value="decline")(?=[^>]*name="response")[^>]*>/);
    expect(html).toContain('name="token" value="the-token"');
    expect(html).toContain('name="invitationId" value="inv-1"');
  });

  it("shows the company's message as text, never as HTML", () => {
    const html = render(view({ message: "<script>alert(1)</script>" }));

    // (React's own form script is in the page; the company's text must not become one.)
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("gives a confirmed invitation its Meet link and no buttons", () => {
    const html = render(view({ state: "confirmed", meetUrl: "https://meet.google.com/abc-defg-hij" }));

    expect(html).toContain("You&#x27;re confirmed");
    expect(html).toContain('href="https://meet.google.com/abc-defg-hij"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('name="response"');
  });

  it("names the organizer's address and Spam in the confirmed state", () => {
    const html = render(
      view({ state: "confirmed", meetUrl: "https://meet.google.com/abc-defg-hij", organizerEmail: "boss@acme.example" }),
    );

    expect(html).toContain("Acme has been told.");
    expect(html).toContain("Google is sending you a calendar invitation from boss@acme.example.");
    expect(html).toContain("If it isn\u2019t in your inbox, look in Spam.");
  });

  it("leaves out the organizer's address when it is not known", () => {
    const html = render(view({ state: "confirmed", meetUrl: "https://meet.google.com/abc-defg-hij", organizerEmail: null }));

    expect(html).toContain("Google is sending you a calendar invitation. If it isn\u2019t in your inbox, look in Spam.");
    expect(html).not.toContain("invitation from");
  });

  it("says a declined, closed or cancelled invitation is, with no buttons", () => {
    const cases = [
      ["declined", "You declined"],
      ["expired", "This invitation has closed"],
      ["cancelled", "This interview was cancelled"],
    ] as const;
    for (const [state, title] of cases) {
      const html = render(view({ state }));
      expect(html, state).toContain(title);
      expect(html, state).not.toContain('name="response"');
    }
  });

  it("shows nothing of the interview once the application is gone", () => {
    const html = render(view({ state: "unavailable" }));

    expect(html).toContain("This invitation is no longer available");
    expect(html).not.toContain("15 January");
    expect(html).not.toContain('name="response"');
  });
});
