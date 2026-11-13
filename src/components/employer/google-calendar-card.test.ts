import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GoogleStatus } from "@/lib/interviews/types";

// Disconnect is a Server Action; this only draws the card.
vi.mock("@/app/(employer)/[company]/(workspace)/settings/actions", () => ({ disconnectGoogle: vi.fn() }));

import { GoogleCalendarCard } from "./google-calendar-card";

const render = (status: Partial<GoogleStatus>, flag?: string) =>
  renderToStaticMarkup(
    createElement(GoogleCalendarCard, {
      status: { configured: true, connected: false, email: null, broken: false, ...status },
      flag,
    }),
  );

describe("GoogleCalendarCard", () => {
  it("offers to connect, with a plain link that goes to Google (not a form, not a prefetched link)", () => {
    const html = render({});

    expect(html).toContain("Connect Google Calendar");
    expect(html).toContain('href="/api/google/connect"');
    expect(html).not.toContain("Disconnect");
  });

  it("shows which account is connected, and Disconnect", () => {
    const html = render({ connected: true, email: "boss@acme.example" });

    expect(html).toContain("Connected as");
    expect(html).toContain("boss@acme.example");
    expect(html).toContain("Disconnect");
    expect(html).not.toContain("Reconnect");
  });

  it("asks to reconnect when Google refused the saved connection", () => {
    const html = render({ connected: true, email: "boss@acme.example", broken: true });

    expect(html).toContain("Needs to be connected again");
    expect(html).toContain("Reconnect");
    expect(html).toContain('href="/api/google/connect"');
    expect(html).toContain("Disconnect");
  });

  it("says Google isn't set up on a server with no credentials, with no way to connect", () => {
    const html = render({ configured: false });

    expect(html).toContain("isn’t set up on this server yet");
    expect(html).not.toContain("/api/google/connect");
  });

  it("says how the trip to Google went, and ignores a flag it doesn't know", () => {
    expect(render({}, "connected")).toContain("Google Calendar is connected.");
    expect(render({}, "denied")).toContain("access was not given");
    expect(render({}, "error")).toContain("Something went wrong with Google Calendar");
    expect(render({}, "disconnected")).toContain("Google Calendar is disconnected.");
    expect(render({}, "<script>")).not.toContain("<script>");
    expect(render({}, "constructor")).not.toContain("undefined");
  });
});
