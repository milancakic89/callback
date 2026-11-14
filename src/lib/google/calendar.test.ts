import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addAttendee, createInterviewEvent, deleteEvent, GoogleCalendarError } from "./calendar";

const EVENT = {
  summary: "Interview: Ana Novak (Product Designer)",
  description: "Interview for Product Designer, scheduled with Callback.",
  startsAt: new Date("2030-01-15T10:00:00.000Z"),
  durationMinutes: 45,
  timeZone: "Europe/Belgrade",
  requestId: "invitation-1",
};

function reply(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createInterviewEvent", () => {
  it("makes the event with a Meet link, no guests and no notifications", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "evt-1", hangoutLink: "https://meet.google.com/abc-defg-hij" }));

    const created = await createInterviewEvent("token", EVENT);

    expect(created).toEqual({ eventId: "evt-1", meetUrl: "https://meet.google.com/abc-defg-hij" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token");
    const body = JSON.parse(init.body);
    expect(body.start).toEqual({ dateTime: "2030-01-15T10:00:00.000Z", timeZone: "Europe/Belgrade" });
    expect(body.end).toEqual({ dateTime: "2030-01-15T10:45:00.000Z", timeZone: "Europe/Belgrade" });
    expect(body.conferenceData.createRequest).toEqual({
      requestId: "invitation-1",
      conferenceSolutionKey: { type: "hangoutsMeet" },
    });
    expect(body.attendees).toBeUndefined();
  });

  it("reads the link from the entry points when there is no hangoutLink", async () => {
    fetchMock.mockResolvedValue(
      reply(200, { id: "evt-1", conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/x" }] } }),
    );

    expect((await createInterviewEvent("token", EVENT)).meetUrl).toBe("https://meet.google.com/x");
  });

  it("asks once more when Meet is late, then gives up and removes the event", async () => {
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (init?.method === "POST") return reply(200, { id: "evt-1" });
      if (init?.method === "DELETE") return reply(204);
      return reply(200, { id: "evt-1" });
    });

    const attempt = createInterviewEvent("token", EVENT);
    const failure = expect(attempt).rejects.toThrow("Google did not create a Meet link");
    await vi.advanceTimersByTimeAsync(1000);
    await failure;

    const methods = fetchMock.mock.calls.map(([, init]) => init?.method ?? "GET");
    expect(methods).toEqual(["POST", "GET", "DELETE"]);
  });

  it("takes a link that arrives on the second read", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { id: "evt-1" }))
      .mockResolvedValueOnce(reply(200, { id: "evt-1", hangoutLink: "https://meet.google.com/late" }));

    const attempt = createInterviewEvent("token", EVENT);
    await vi.advanceTimersByTimeAsync(1000);

    expect((await attempt).meetUrl).toBe("https://meet.google.com/late");
  });

  it("fails with Google's status when the event is refused", async () => {
    fetchMock.mockResolvedValue(reply(403));

    const error = await createInterviewEvent("token", EVENT).catch((caught) => caught);
    expect(error).toBeInstanceOf(GoogleCalendarError);
    expect(error.status).toBe(403);
  });
});

describe("addAttendee", () => {
  it("adds the candidate as a guest and lets Google send the invitation", async () => {
    fetchMock.mockResolvedValue(reply(200));

    await addAttendee("token", "evt/1", "ana@example.com");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/evt%2F1?sendUpdates=all&conferenceDataVersion=1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ attendees: [{ email: "ana@example.com" }] });
  });

  it("fails when Google refuses", async () => {
    fetchMock.mockResolvedValue(reply(404));
    await expect(addAttendee("token", "evt-1", "ana@example.com")).rejects.toThrow("Adding the guest failed (404)");
  });
});

describe("deleteEvent", () => {
  it("tells the guests only when asked to", async () => {
    fetchMock.mockResolvedValue(reply(204));

    await deleteEvent("token", "evt-1", true);
    await deleteEvent("token", "evt-1", false);

    expect(fetchMock.mock.calls[0][0]).toContain("sendUpdates=all");
    expect(fetchMock.mock.calls[1][0]).toContain("sendUpdates=none");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("counts an event that is already gone as deleted", async () => {
    for (const status of [404, 410]) {
      fetchMock.mockResolvedValue(reply(status));
      await expect(deleteEvent("token", "evt-1", false)).resolves.toBeUndefined();
    }
  });

  it("fails on any other refusal", async () => {
    fetchMock.mockResolvedValue(reply(500));
    await expect(deleteEvent("token", "evt-1", false)).rejects.toThrow("Deleting the event failed (500)");
  });
});

function replyWithUnreadableBody(status: number) {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
  };
}

const INSUFFICIENT_SCOPES_BODY = {
  error: {
    code: 403,
    message: "Request had insufficient authentication scopes.",
    status: "PERMISSION_DENIED",
    errors: [{ reason: "insufficientPermissions" }],
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
        metadata: { service: "calendar-json.googleapis.com" },
      },
    ],
  },
};

describe("the reason Google gives for a refused call", () => {
  it("takes the ErrorInfo reason and Google's text, and nothing else from the body", async () => {
    fetchMock.mockResolvedValue(reply(403, INSUFFICIENT_SCOPES_BODY));

    const error = await createInterviewEvent("token", EVENT).catch((caught) => caught);

    expect(error).toBeInstanceOf(GoogleCalendarError);
    expect(error.status).toBe(403);
    expect(error.reason).toBe("ACCESS_TOKEN_SCOPE_INSUFFICIENT");
    expect(error.message).toBe(
      "Creating the event failed (403): ACCESS_TOKEN_SCOPE_INSUFFICIENT, Request had insufficient authentication scopes.",
    );
    expect(error.message).not.toContain("calendar-json");
  });

  it("falls back to the first errors[] reason when there are no details", async () => {
    fetchMock.mockResolvedValue(
      reply(403, {
        error: {
          message: "Google Calendar API has not been used in project 123 before or it is disabled.",
          errors: [{ reason: "accessNotConfigured" }, { reason: "somethingElse" }],
        },
      }),
    );

    const error = await createInterviewEvent("token", EVENT).catch((caught) => caught);

    expect(error.reason).toBe("accessNotConfigured");
    expect(error.message).toBe(
      "Creating the event failed (403): accessNotConfigured, Google Calendar API has not been used in project 123 before or it is disabled.",
    );
  });

  it("skips a details entry without a reason", async () => {
    fetchMock.mockResolvedValue(
      reply(403, { error: { details: [{ "@type": "type.googleapis.com/google.rpc.Help" }, { reason: "RATE_LIMIT_EXCEEDED" }] } }),
    );

    const error = await createInterviewEvent("token", EVENT).catch((caught) => caught);

    expect(error.reason).toBe("RATE_LIMIT_EXCEEDED");
    expect(error.message).toBe("Creating the event failed (403): RATE_LIMIT_EXCEEDED");
  });

  it("keeps only Google's text when there is no reason", async () => {
    fetchMock.mockResolvedValue(reply(403, { error: { message: "The caller does not have permission" } }));

    const error = await createInterviewEvent("token", EVENT).catch((caught) => caught);

    expect(error.reason).toBeNull();
    expect(error.message).toBe("Creating the event failed (403): The caller does not have permission");
  });

  it("gives no reason when the body is empty or not what Google sends", async () => {
    for (const body of [{}, null, "Forbidden", { error: "Forbidden" }, { error: { details: "x", errors: "y", message: 7 } }]) {
      fetchMock.mockResolvedValue(reply(403, body));

      const error = await createInterviewEvent("token", EVENT).catch((caught) => caught);

      expect(error.reason).toBeNull();
      expect(error.message).toBe("Creating the event failed (403)");
    }
  });

  it("gives no reason when the body is not JSON", async () => {
    fetchMock.mockResolvedValue(replyWithUnreadableBody(403));

    const error = await createInterviewEvent("token", EVENT).catch((caught) => caught);

    expect(error).toBeInstanceOf(GoogleCalendarError);
    expect(error.status).toBe(403);
    expect(error.reason).toBeNull();
    expect(error.message).toBe("Creating the event failed (403)");
  });

  it("is carried by a refused guest", async () => {
    fetchMock.mockResolvedValue(reply(403, INSUFFICIENT_SCOPES_BODY));

    const error = await addAttendee("token", "evt-1", "ana@example.com").catch((caught) => caught);

    expect(error).toBeInstanceOf(GoogleCalendarError);
    expect(error.status).toBe(403);
    expect(error.reason).toBe("ACCESS_TOKEN_SCOPE_INSUFFICIENT");
    expect(error.message).toBe(
      "Adding the guest failed (403): ACCESS_TOKEN_SCOPE_INSUFFICIENT, Request had insufficient authentication scopes.",
    );
  });

  it("is carried by a refused delete", async () => {
    fetchMock.mockResolvedValue(reply(403, INSUFFICIENT_SCOPES_BODY));

    const error = await deleteEvent("token", "evt-1", false).catch((caught) => caught);

    expect(error).toBeInstanceOf(GoogleCalendarError);
    expect(error.status).toBe(403);
    expect(error.reason).toBe("ACCESS_TOKEN_SCOPE_INSUFFICIENT");
    expect(error.message).toBe(
      "Deleting the event failed (403): ACCESS_TOKEN_SCOPE_INSUFFICIENT, Request had insufficient authentication scopes.",
    );
  });

  it("does not look at the body of an event that is already gone", async () => {
    fetchMock.mockResolvedValue(reply(404, INSUFFICIENT_SCOPES_BODY));

    await expect(deleteEvent("token", "evt-1", false)).resolves.toBeUndefined();
  });

  it("leaves the errors without a Google body as they were", () => {
    const error = new GoogleCalendarError("Google did not create a Meet link");

    expect(error.status).toBeNull();
    expect(error.reason).toBeNull();
  });
});
