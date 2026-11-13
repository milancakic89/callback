import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptyScheduleDraft, type ScheduleDraft } from "@/lib/interviews/schedule-form";
import type { GoogleStatus } from "@/lib/interviews/types";
import { InterviewScheduleFields } from "./interview-schedule-fields";

const CONNECTED: GoogleStatus = { configured: true, connected: true, email: "boss@acme.example", broken: false };
const NOT_CONNECTED: GoogleStatus = { configured: true, connected: false, email: null, broken: false };
const BROKEN: GoogleStatus = { configured: true, connected: true, email: "boss@acme.example", broken: true };
const NOT_CONFIGURED: GoogleStatus = { configured: false, connected: false, email: null, broken: false };

const render = (props: { draft?: Partial<ScheduleDraft>; google?: GoogleStatus; problem?: string | null; showToggle?: boolean } = {}) =>
  renderToStaticMarkup(
    createElement(InterviewScheduleFields, {
      idPrefix: "x",
      draft: { ...emptyScheduleDraft(), ...props.draft },
      onChange: vi.fn(),
      timeZone: "Europe/Belgrade",
      problem: props.problem ?? null,
      google: props.google ?? CONNECTED,
      settingsHref: "/acme/settings",
      showToggle: props.showToggle ?? true,
    }),
  );

describe("InterviewScheduleFields", () => {
  it("asks for the day, the time, the length and a message, in the employer's zone", () => {
    const html = render();

    for (const part of ['type="date"', 'type="time"', "30 minutes", "45 minutes", "1 hour", "1 hour 30 minutes", "Message to the candidate", "Time zone: Europe/Belgrade"]) {
      expect(html, part).toContain(part);
    }
    expect(html).toContain("Send a Google Meet invitation");
  });

  it("marks the chosen length", () => {
    const html = render({ draft: { durationMinutes: 60 } });

    expect(html).toMatch(/aria-pressed="true"[^>]*>1 hour</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>45 minutes</);
  });

  it("says what is wrong with the time, as an alert", () => {
    const html = render({ problem: "Choose a time in the future." });

    expect(html).toContain('role="alert"');
    expect(html).toContain("Choose a time in the future.");
  });

  it("hides the fields and the toggle when the employer turned the invitation off, or there is no toggle", () => {
    const off = render({ draft: { send: false } });
    expect(off).not.toContain('type="date"');
    expect(off).toContain("Send a Google Meet invitation");

    const noToggle = render({ showToggle: false });
    expect(noToggle).not.toContain("Send a Google Meet invitation");
    expect(noToggle).toContain('type="date"');
  });

  it("locks the toggle and links to Settings while Google isn't connected", () => {
    const html = render({ google: NOT_CONNECTED });

    expect(html).toContain("Google Calendar isn&#x27;t connected");
    expect(html).toContain('href="/acme/settings"');
    expect(html).toContain("to connect it");
    expect(html).not.toContain('type="date"');
    // The checkbox is off and can't be turned on.
    expect(html).toMatch(/role="checkbox"[^>]*aria-disabled="true"[^>]*aria-checked="false"/);
  });

  it("asks to reconnect when Google refused the saved connection", () => {
    const html = render({ google: BROKEN });

    expect(html).toContain("needs to be connected again");
    expect(html).toContain("to reconnect it");
  });

  it("says Google isn't set up when the server has no credentials, with no link", () => {
    const html = render({ google: NOT_CONFIGURED });

    expect(html).toContain("isn&#x27;t set up on this server");
    expect(html).not.toContain("/acme/settings");
  });
});
