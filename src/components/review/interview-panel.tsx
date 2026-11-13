"use client";

import { CalendarClockIcon, VideoIcon } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { cancelInterview, inviteToInterview } from "@/app/(employer)/[company]/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatDeadline, formatDuration, formatInterviewTime } from "@/lib/interviews/format";
import { browserTimeZone, draftProblem, draftToRequest, emptyScheduleDraft, type ScheduleDraft } from "@/lib/interviews/schedule-form";
import { INTERVIEW_STATUS_LABELS, type GoogleStatus, type Interview, type InterviewStatus } from "@/lib/interviews/types";
import type { StageChoice } from "@/lib/review/stages";
import { cn } from "cn";
import { InterviewScheduleFields } from "./interview-schedule-fields";

// The Interview block of the review screen's right column (features/interview-invitations.md): where the
// invitation stands, its Meet link, and the buttons to cancel it or to send a new one. It shows for a
// candidate the company has applied to an interview step, and for any candidate who has an invitation.

export function InterviewPanel({
  applicationId,
  candidateName,
  candidateStage,
  interview,
  interviewStepIds,
  google,
  settingsHref,
  onChange,
  onNotice,
}: {
  applicationId: string;
  candidateName: string;
  // What the candidate has been shown: an invitation only makes sense for a step they have seen.
  candidateStage: StageChoice;
  interview: Interview | null;
  interviewStepIds: ReadonlySet<string>;
  google: GoogleStatus;
  settingsHref: string;
  onChange: (interview: Interview | null) => void;
  onNotice: (message: string) => void;
}) {
  const onInterviewStep =
    candidateStage.stage === "STEP" && candidateStage.stepId !== null && interviewStepIds.has(candidateStage.stepId);
  if (!interview && !onInterviewStep) return null;

  const open = interview?.status === "pending" || interview?.status === "confirmed";

  return (
    <section aria-labelledby="interview-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p id="interview-heading" className="font-mono text-[10.5px] font-medium tracking-[0.14em] text-(--l-fg-subtle) uppercase">
          Interview
        </p>
        {interview && <StatusChip status={interview.status} />}
      </div>

      {interview ? (
        <div className="flex flex-col gap-1.5 text-[12.5px] leading-snug">
          <p className="flex items-start gap-2 text-(--l-fg)">
            <CalendarClockIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-(--l-fg-subtle)" />
            <span>
              {formatInterviewTime(interview.startsAt, interview.timeZone)}
              <span className="block text-(--l-fg-subtle)">{formatDuration(interview.durationMinutes)}</span>
            </span>
          </p>
          {interview.status === "pending" && (
            <p className="text-(--l-fg-muted)">Waiting for an answer until {formatDeadline(interview.expiresAt, interview.timeZone)}.</p>
          )}
          {interview.status === "expired" && (
            <p className="text-(--l-fg-muted)">No answer by {formatDeadline(interview.expiresAt, interview.timeZone)}.</p>
          )}
          {interview.respondedAt && (
            <p className="text-(--l-fg-muted)">Answered {formatDeadline(interview.respondedAt, interview.timeZone)}.</p>
          )}
          {open && interview.meetUrl && (
            <a
              href={interview.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-(--l-lime) underline-offset-4 hover:underline"
            >
              <VideoIcon aria-hidden className="size-3.5" /> Google Meet
            </a>
          )}
        </div>
      ) : (
        <p className="text-[12.5px] leading-relaxed text-(--l-fg-muted)">No invitation has been sent to {candidateName} yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {open && interview ? (
          <CancelInterviewButton
            invitationId={interview.id}
            candidateName={candidateName}
            confirmed={interview.status === "confirmed"}
            onCancelled={() => onChange(null)}
            onNotice={onNotice}
          />
        ) : (
          onInterviewStep && (
            <SendInvitationButton
              applicationId={applicationId}
              candidateName={candidateName}
              label={interview ? "Send a new invitation" : "Send invitation"}
              google={google}
              settingsHref={settingsHref}
              onSent={onChange}
            />
          )
        )}
      </div>
    </section>
  );
}

const CHIP_CLASSES: Record<InterviewStatus, string> = {
  pending: "border-(--l-line-strong) text-(--l-fg-muted)",
  confirmed: "border-(--l-lime)/40 bg-(--l-lime)/[0.12] text-(--l-lime)",
  declined: "border-(--l-line-strong) text-(--l-fg-subtle)",
  expired: "border-(--l-line-strong) text-(--l-fg-subtle)",
  cancelled: "border-(--l-line-strong) text-(--l-fg-subtle)",
};

function StatusChip({ status }: { status: InterviewStatus }) {
  return (
    <span className={cn("rounded-full border px-1.5 py-px text-[10.5px] leading-4", CHIP_CLASSES[status])}>
      {INTERVIEW_STATUS_LABELS[status]}
    </span>
  );
}

const OUTLINE_BUTTON =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-(--l-line-strong) bg-white/[0.03] px-3 text-[12.5px] font-medium text-(--l-fg) transition-colors hover:bg-white/[0.07] disabled:pointer-events-none disabled:opacity-60";

function CancelInterviewButton({
  invitationId,
  candidateName,
  confirmed,
  onCancelled,
  onNotice,
}: {
  invitationId: string;
  candidateName: string;
  confirmed: boolean;
  onCancelled: () => void;
  onNotice: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const keepRef = useRef<HTMLButtonElement>(null);

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelInterview(invitationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onCancelled();
      if (!result.calendarCleaned) onNotice("The interview is cancelled, but the event is still in your Google Calendar. Delete it there.");
    });
  }

  return (
    <>
      <button type="button" className={OUTLINE_BUTTON} onClick={() => setOpen(true)}>
        Cancel interview
      </button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent data-landing className="dark" initialFocus={keepRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel the interview with {candidateName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The event is removed from your Google Calendar.{" "}
              {confirmed ? "They confirmed, so Google tells them it was cancelled." : "Their link stops working."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={keepRef} disabled={pending}>
              Keep it
            </AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
              {pending ? "Cancelling…" : "Cancel interview"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SendInvitationButton({
  applicationId,
  candidateName,
  label,
  google,
  settingsHref,
  onSent,
}: {
  applicationId: string;
  candidateName: string;
  label: string;
  google: GoogleStatus;
  settingsHref: string;
  onSent: (interview: Interview) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ScheduleDraft>(emptyScheduleDraft);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const timeZone = useMemo(() => browserTimeZone(), []);
  const usable = google.configured && google.connected && !google.broken;
  const problem = usable ? draftProblem(draft, new Date()) : null;

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) setError(null);
  }

  function onSend() {
    const request = draftToRequest(draft, applicationId, timeZone, new Date());
    if (!request) return;
    setError(null);
    startTransition(async () => {
      const outcome = await inviteToInterview(request);
      if (outcome.ok) {
        setOpen(false);
        setDraft(emptyScheduleDraft());
        onSent(outcome.interview);
      } else {
        setError(outcome.error);
      }
    });
  }

  return (
    <>
      <button type="button" className={OUTLINE_BUTTON} onClick={() => onOpenChange(true)}>
        {label}
      </button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent data-landing className="dark" initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Invite {candidateName} to an interview</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a Google Meet event in your calendar and emails {candidateName} to confirm or decline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <InterviewScheduleFields
            idPrefix={`invite-${applicationId}`}
            draft={draft}
            onChange={(patch) => setDraft((all) => ({ ...all, ...patch }))}
            timeZone={timeZone}
            problem={problem}
            google={google}
            settingsHref={settingsHref}
            showToggle={false}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" disabled={pending || !usable || Boolean(problem)} onClick={onSend}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
