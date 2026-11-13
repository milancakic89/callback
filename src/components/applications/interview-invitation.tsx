import { CalendarClockIcon, VideoIcon } from "lucide-react";
import { InterviewAnswerButtons } from "@/components/applications/interview-answer-buttons";
import { buttonVariants } from "@/components/ui/button";
import { formatDeadline, formatDuration, formatInterviewTime } from "@/lib/interviews/format";
import type { CandidateInterview } from "@/lib/interviews/types";

// The company's interview invitation on the candidate's application (features/interview-invitations.md):
// the same one the email's page shows, for a candidate who is signed in. No hooks: the answer buttons are
// their own client component.
export function InterviewInvitation({ interview, companyName }: { interview: CandidateInterview; companyName: string }) {
  const when = formatInterviewTime(interview.startsAt, interview.timeZone);

  return (
    <div className="grid gap-3 rounded-lg border p-3 text-sm">
      <div className="flex items-start gap-2">
        <CalendarClockIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="grid gap-0.5">
          <p className="font-medium">{headline(interview, companyName)}</p>
          <p className="text-muted-foreground">
            {when} · {formatDuration(interview.durationMinutes)}
          </p>
        </div>
      </div>

      {interview.message && (
        // Plain text, never HTML: the company typed it.
        <p className="rounded-md bg-muted/50 p-2.5 leading-relaxed whitespace-pre-wrap">{interview.message}</p>
      )}

      {interview.status === "pending" && (
        <>
          <p className="text-muted-foreground">
            Please answer by {formatDeadline(interview.expiresAt, interview.timeZone)}. If you don&rsquo;t, the
            invitation closes.
          </p>
          <InterviewAnswerButtons invitationId={interview.id} />
        </>
      )}
      {interview.status === "confirmed" && interview.meetUrl && (
        <a
          href={interview.meetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: "sm", className: "w-fit" })}
        >
          <VideoIcon aria-hidden /> Open Google Meet
        </a>
      )}
      {interview.status === "expired" && (
        <p className="text-muted-foreground">The answer was due by {formatDeadline(interview.expiresAt, interview.timeZone)}.</p>
      )}
    </div>
  );
}

function headline(interview: CandidateInterview, companyName: string): string {
  switch (interview.status) {
    case "pending":
      return `${companyName} invited you to an interview`;
    case "confirmed":
      return "You confirmed the interview";
    case "declined":
      return "You declined the interview";
    case "expired":
      return "The invitation closed with no answer";
    case "cancelled":
      return "The interview was cancelled";
  }
}
