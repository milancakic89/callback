import { effectiveStatus } from "./schedule";
import { isInterviewStatus, type Interview } from "./types";

// An invitation row as the review screen reads it (an embed of interview_invitations on the application).
export type InterviewRow = {
  id: string;
  status: string;
  starts_at: string;
  duration_minutes: number;
  time_zone: string;
  expires_at: string;
  responded_at: string | null;
  meet_url: string | null;
  created_at: string;
};

// The invitation the screen shows for an application: the newest one that wasn't cancelled (a cancelled
// one is as if it had never been sent). Null when there is none.
export function latestInterview(rows: readonly InterviewRow[], now: Date): Interview | null {
  const latest = [...rows]
    .filter((row) => isInterviewStatus(row.status) && row.status !== "cancelled")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!latest || !isInterviewStatus(latest.status)) return null;

  return {
    id: latest.id,
    status: effectiveStatus(latest.status, latest.expires_at, now),
    startsAt: latest.starts_at,
    durationMinutes: latest.duration_minutes,
    timeZone: latest.time_zone,
    expiresAt: latest.expires_at,
    respondedAt: latest.responded_at,
    meetUrl: latest.meet_url,
  };
}
