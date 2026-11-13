// How an interview's time reads (features/interview-invitations.md): in the zone the company chose it
// in, with the zone's name, so the candidate in another zone isn't misled. Plain module: the emails, the
// candidate's page and the review screen use it, and `en-GB` keeps the 24-hour clock.

export function formatInterviewTime(startsAt: string | Date, timeZone: string): string {
  const date = new Date(startsAt);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(date);
  return `${day}, ${time} (${timeZone})`;
}

// "45 minutes", "1 hour", "1 hour 30 minutes".
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(hours === 1 ? "1 hour" : `${hours} hours`);
  if (rest > 0) parts.push(rest === 1 ? "1 minute" : `${rest} minutes`);
  return parts.join(" ");
}

// When an answer is due, for the "Waiting for an answer until …" line.
export function formatDeadline(expiresAt: string | Date, timeZone: string): string {
  const date = new Date(expiresAt);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(date);
  return `${day}, ${time}`;
}
