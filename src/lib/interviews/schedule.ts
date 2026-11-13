import { z } from "zod";
import { text, tooLong } from "@/lib/validation/text-fields";
import type { InterviewStatus } from "./types";

// The rules of an invitation's time (features/interview-invitations.md). The database enforces the same
// ones (create_interview_invitation(), 20261113120000_interview_invitations.sql); this is what the
// dialog and the Server Action check first, so a mistake is told before anything is sent.

export const INTERVIEW_DURATIONS = [30, 45, 60, 90] as const;
export const DEFAULT_INTERVIEW_DURATION = 45;
export const INTERVIEW_MESSAGE_MAX = 1000;

const HOUR_MS = 3_600_000;
// The candidate has 48 hours to answer, and the answer is due 2 hours before the interview at the
// latest. A start less than 3 hours away leaves no window, so it is not allowed.
export const RESPONSE_WINDOW_MS = 48 * HOUR_MS;
export const CLOSE_BEFORE_START_MS = 2 * HOUR_MS;
export const MIN_LEAD_MS = 3 * HOUR_MS;
export const MAX_LEAD_MS = 90 * 24 * HOUR_MS;

// When the answer is due for an invitation sent at `sentAt`.
export function responseDeadline(sentAt: Date, startsAt: Date): Date {
  return new Date(Math.min(sentAt.getTime() + RESPONSE_WINDOW_MS, startsAt.getTime() - CLOSE_BEFORE_START_MS));
}

export type StartProblem = "past" | "too_soon" | "too_far";

// Why `startsAt` can't be an interview's start, or null when it can.
export function startProblem(startsAt: Date, now: Date): StartProblem | null {
  const lead = startsAt.getTime() - now.getTime();
  if (Number.isNaN(lead)) return "past";
  if (lead < 0) return "past";
  if (lead < MIN_LEAD_MS) return "too_soon";
  if (lead > MAX_LEAD_MS) return "too_far";
  return null;
}

export const START_PROBLEM_MESSAGES: Record<StartProblem, string> = {
  past: "Choose a time in the future.",
  too_soon: "Choose a time at least 3 hours from now, so the candidate has time to answer.",
  too_far: "Choose a time within the next 90 days.",
};

// A pending invitation whose deadline has passed is expired, even if the job that records it has not
// run yet.
export function effectiveStatus(status: InterviewStatus, expiresAt: string | Date, now: Date): InterviewStatus {
  if (status !== "pending") return status;
  return new Date(expiresAt).getTime() <= now.getTime() ? "expired" : status;
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// What the dialog sends for one candidate: the instant (ISO, from the browser's own local time) and the
// zone it was chosen in, which the email and the event show it in.
export const interviewRequestSchema = z.object({
  applicationId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z
    .number()
    .int()
    .refine((minutes) => (INTERVIEW_DURATIONS as readonly number[]).includes(minutes), "Choose one of the lengths offered."),
  timeZone: z.string().min(1).max(64).refine(isValidTimeZone, "Unknown time zone."),
  message: text.pipe(z.string().max(INTERVIEW_MESSAGE_MAX, tooLong(INTERVIEW_MESSAGE_MAX))).optional(),
});

export type InterviewRequest = z.infer<typeof interviewRequestSchema>;
