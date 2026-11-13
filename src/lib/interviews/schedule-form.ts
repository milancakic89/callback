import {
  DEFAULT_INTERVIEW_DURATION,
  startProblem,
  START_PROBLEM_MESSAGES,
  type InterviewRequest,
} from "./schedule";

// What the employer fills in for one invitation (features/interview-invitations.md), before it becomes the
// request the Server Action takes. A plain module with no React, so the dialog's rules are tested without
// a browser. `date` and `time` are what the browser's date and time inputs give, in the employer's own
// time zone: "2026-11-20" and "14:30".
export type ScheduleDraft = {
  // Whether to send an invitation at all; off applies the status and nothing else.
  send: boolean;
  date: string;
  time: string;
  durationMinutes: number;
  message: string;
};

export function emptyScheduleDraft(): ScheduleDraft {
  return { send: true, date: "", time: "10:00", durationMinutes: DEFAULT_INTERVIEW_DURATION, message: "" };
}

// The wall-clock time the inputs name, read in the browser's own zone (a date and time with no offset are
// local time), or null while either is missing.
export function draftStart(draft: Pick<ScheduleDraft, "date" | "time">): Date | null {
  if (!draft.date || !draft.time) return null;
  const start = new Date(`${draft.date}T${draft.time}`);
  return Number.isNaN(start.getTime()) ? null : start;
}

// What is wrong with the draft, as the employer should read it, or null when it can be sent. A draft that
// won't send has nothing wrong with it.
export function draftProblem(draft: ScheduleDraft, now: Date): string | null {
  if (!draft.send) return null;
  const start = draftStart(draft);
  if (!start) return "Choose a date and a time.";
  const problem = startProblem(start, now);
  return problem ? START_PROBLEM_MESSAGES[problem] : null;
}

// The request for one application, or null when the draft isn't one to send (it is off, or invalid).
export function draftToRequest(
  draft: ScheduleDraft,
  applicationId: string,
  timeZone: string,
  now: Date,
): InterviewRequest | null {
  if (!draft.send || draftProblem(draft, now)) return null;
  const start = draftStart(draft);
  if (!start) return null;
  return {
    applicationId,
    startsAt: start.toISOString(),
    durationMinutes: draft.durationMinutes,
    timeZone,
    ...(draft.message.trim() ? { message: draft.message } : {}),
  };
}

// The employer's own time zone, which the invitation shows its time in.
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
