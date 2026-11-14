// The few Google Calendar calls the interview invitations need (features/interview-invitations.md):
// an event with a Meet link in the company's primary calendar, the candidate added as a guest once
// they confirm, and the event deleted. Plain `fetch`, the access token passed in. No `server-only`,
// so it can be tested with a stubbed fetch.

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    // Google's own code for the refusal, e.g. ACCESS_TOKEN_SCOPE_INSUFFICIENT. Only in the log.
    readonly reason: string | null = null,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

type GoogleErrorBody = {
  error?: {
    message?: unknown;
    errors?: { reason?: unknown }[];
    details?: { reason?: unknown }[];
  };
};

async function readErrorBody(response: Response): Promise<GoogleErrorBody | null> {
  try {
    return (await response.json()) as GoogleErrorBody | null;
  } catch {
    return null;
  }
}

function reasonOf(entry: { reason?: unknown } | undefined): string | null {
  return typeof entry?.reason === "string" ? entry.reason : null;
}

function firstReasonOf(entries: { reason?: unknown }[] | undefined): string | null {
  if (!Array.isArray(entries)) return null;
  return entries.map(reasonOf).find((reason) => reason !== null) ?? null;
}

// The error for a refused call. Google's body says why (a reason code and a sentence), so both go into
// the message, for the log. A body that isn't JSON gives no reason. Nothing else from it is kept (its
// `metadata` names the Cloud project).
async function refusedCall(response: Response, action: string): Promise<GoogleCalendarError> {
  const googleError = (await readErrorBody(response))?.error;
  const errorInfoReason = firstReasonOf(googleError?.details);
  const legacyReason = Array.isArray(googleError?.errors) ? reasonOf(googleError.errors[0]) : null;
  const reason = errorInfoReason ?? legacyReason;
  const text = typeof googleError?.message === "string" && googleError.message ? googleError.message : null;
  const explanation = [reason, text].filter((part): part is string => part !== null).join(", ");
  const message = `${action} failed (${response.status})${explanation ? `: ${explanation}` : ""}`;
  return new GoogleCalendarError(message, response.status, reason);
}

function authHeaders(accessToken: string, json = false): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}

type EventResponse = {
  id?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
};

function meetLinkOf(event: EventResponse): string | null {
  return (
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ??
    null
  );
}

export type InterviewEvent = {
  summary: string;
  description: string;
  startsAt: Date;
  durationMinutes: number;
  timeZone: string;
  // Makes the Meet link idempotent: a retry of the same request gets the same conference.
  requestId: string;
};

// Meet can answer a moment late for a new event, so the link is read again once before giving up.
const MEET_RETRY_MS = 800;

// Creates the event with a Google Meet link. No guests and no notifications (`sendUpdates=none`): until
// the candidate confirms, the event only holds the slot in the company's calendar.
export async function createInterviewEvent(
  accessToken: string,
  event: InterviewEvent,
): Promise<{ eventId: string; meetUrl: string }> {
  const endsAt = new Date(event.startsAt.getTime() + event.durationMinutes * 60_000);
  const response = await fetch(`${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=none`, {
    method: "POST",
    headers: authHeaders(accessToken, true),
    cache: "no-store",
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startsAt.toISOString(), timeZone: event.timeZone },
      end: { dateTime: endsAt.toISOString(), timeZone: event.timeZone },
      conferenceData: {
        createRequest: { requestId: event.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } },
      },
      guestsCanModify: false,
      guestsCanInviteOthers: false,
    }),
  });
  if (!response.ok) throw await refusedCall(response, "Creating the event");

  const created = (await response.json()) as EventResponse;
  if (!created.id) throw new GoogleCalendarError("Google did not return an event id");

  let meetUrl = meetLinkOf(created);
  if (!meetUrl) {
    await new Promise((resolve) => setTimeout(resolve, MEET_RETRY_MS));
    const again = await fetch(`${EVENTS_URL}/${encodeURIComponent(created.id)}?conferenceDataVersion=1`, {
      headers: authHeaders(accessToken),
      cache: "no-store",
    });
    if (again.ok) meetUrl = meetLinkOf((await again.json()) as EventResponse);
  }
  if (!meetUrl) {
    // An event with no Meet link is no use to anyone; don't leave it in the calendar.
    await deleteEvent(accessToken, created.id, false).catch(() => undefined);
    throw new GoogleCalendarError("Google did not create a Meet link");
  }

  return { eventId: created.id, meetUrl };
}

// The candidate confirmed: Google sends them the calendar invitation (`sendUpdates=all`).
export async function addAttendee(accessToken: string, eventId: string, email: string): Promise<void> {
  const response = await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=all&conferenceDataVersion=1`, {
    method: "PATCH",
    headers: authHeaders(accessToken, true),
    cache: "no-store",
    body: JSON.stringify({ attendees: [{ email }] }),
  });
  if (!response.ok) throw await refusedCall(response, "Adding the guest");
}

// An event that is already gone (404, 410) is as good as deleted. `notify` tells the guests it was
// cancelled: only worth it once the candidate is one.
export async function deleteEvent(accessToken: string, eventId: string, notify: boolean): Promise<void> {
  const response = await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=${notify ? "all" : "none"}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
    cache: "no-store",
  });
  if (response.ok || response.status === 404 || response.status === 410) return;
  throw await refusedCall(response, "Deleting the event");
}
