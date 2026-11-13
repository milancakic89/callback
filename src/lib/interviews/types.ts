// Interview invitations (features/interview-invitations.md), as the screens see them. Plain module:
// client components use the types and the labels.

export const INTERVIEW_STATUSES = ["pending", "confirmed", "declined", "expired", "cancelled"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export function isInterviewStatus(value: unknown): value is InterviewStatus {
  return (INTERVIEW_STATUSES as readonly unknown[]).includes(value);
}

// What the company sees of an invitation. `status` is the effective one: a pending invitation past its
// deadline is already "expired", whether or not the expiry job has run (effectiveStatus()).
export type Interview = {
  id: string;
  status: InterviewStatus;
  startsAt: string;
  durationMinutes: number;
  timeZone: string;
  expiresAt: string;
  respondedAt: string | null;
  meetUrl: string | null;
};

// What the candidate sees of one, from my_job_applications(). The Meet link is there only once they
// have confirmed.
export type CandidateInterview = {
  id: string;
  status: InterviewStatus;
  startsAt: string;
  durationMinutes: number;
  timeZone: string;
  expiresAt: string;
  message: string | null;
  meetUrl: string | null;
};

// The company's side of the calendar connection, for the settings page and the review screen.
export type GoogleStatus = {
  // Whether this server has Google credentials at all (they are optional in the environment).
  configured: boolean;
  connected: boolean;
  email: string | null;
  // Google refused the saved token: the company has to connect again.
  broken: boolean;
};

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  pending: "Waiting for an answer",
  confirmed: "Confirmed",
  declined: "Declined",
  expired: "No response",
  cancelled: "Cancelled",
};

// A shorter reading for the playlist's badge.
export const INTERVIEW_BADGE_LABELS: Record<InterviewStatus, string> = {
  pending: "Invited",
  confirmed: "Confirmed",
  declined: "Declined",
  expired: "No response",
  cancelled: "Cancelled",
};
