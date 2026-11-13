"use client";

import { ArrowRightIcon, SendIcon } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
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
import type { InterviewRequest } from "@/lib/interviews/schedule";
import {
  browserTimeZone,
  draftProblem,
  draftToRequest,
  emptyScheduleDraft,
  type ScheduleDraft,
} from "@/lib/interviews/schedule-form";
import type { GoogleStatus } from "@/lib/interviews/types";
import type { PendingStageChange } from "@/lib/review/pending-stages";
import { choiceLabel, type StageOption } from "@/lib/review/stages";
import { InterviewScheduleFields } from "./interview-schedule-fields";

// "Apply statuses" on the review screen (features/candidate-steps.md). Choosing a status is saved at
// once but only the employer sees it; this shows all the pending ones to their candidates, after a
// confirmation that lists each change. The dialog stays open while it runs and shows an error instead
// of closing on a failure, and Cancel takes the initial focus, as in PublishJobButton.

export type ApplyOutcome = { ok: true; skipped: number } | { ok: false; error: string };

// Interview invitations (features/interview-invitations.md): a candidate moved to one of these steps gets
// a row for the day and the time, and the invitation goes out together with the status.
export type InterviewSupport = {
  // The ids of the company's interview steps.
  stepIds: ReadonlySet<string>;
  google: GoogleStatus;
  settingsHref: string;
};

const NO_INTERVIEWS: InterviewSupport = {
  stepIds: new Set(),
  google: { configured: false, connected: false, email: null, broken: false },
  settingsHref: "",
};

// The changes that move a candidate to an interview step, which are the ones that can send an invitation.
function interviewChanges(changes: readonly PendingStageChange[], stepIds: ReadonlySet<string>) {
  return changes.filter((change) => change.to.stage === "STEP" && change.to.stepId !== null && stepIds.has(change.to.stepId));
}

export function ApplyStagesButton({
  changes,
  options,
  onApply,
  interviews = NO_INTERVIEWS,
}: {
  changes: readonly PendingStageChange[];
  options: readonly StageOption[];
  onApply: (changes: PendingStageChange[], interviews: InterviewRequest[]) => Promise<ApplyOutcome>;
  interviews?: InterviewSupport;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, ScheduleDraft>>({});
  const cancelRef = useRef<HTMLButtonElement>(null);
  const count = changes.length;
  const withInterview = useMemo(() => interviewChanges(changes, interviews.stepIds), [changes, interviews.stepIds]);
  const timeZone = useMemo(() => browserTimeZone(), []);
  const canInvite = interviews.google.configured && interviews.google.connected && !interviews.google.broken;
  // Read when the dialog opens and on every change, so a time that has become too soon is told.
  const now = new Date();
  const problems = new Map(
    withInterview.map((change) => [change.id, canInvite ? draftProblem(draftFor(change.id), now) : null] as const),
  );
  const blocked = [...problems.values()].some(Boolean);

  function draftFor(id: string): ScheduleDraft {
    return drafts[id] ?? emptyScheduleDraft();
  }

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) setError(null);
  }

  function onConfirm() {
    setError(null);
    const requests = canInvite
      ? withInterview.flatMap((change) => draftToRequest(draftFor(change.id), change.id, timeZone, new Date()) ?? [])
      : [];
    startTransition(async () => {
      const result = await onApply([...changes], requests);
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={count === 0}
        onClick={() => onOpenChange(true)}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-(--l-line-strong) bg-white/[0.03] px-3 text-[13px] font-medium text-(--l-fg) transition-colors hover:bg-white/[0.07] disabled:pointer-events-none disabled:text-(--l-fg-subtle) disabled:opacity-60"
      >
        <SendIcon aria-hidden className="size-3.5" />
        Apply statuses{count > 0 && <span className="font-mono tabular-nums">({count})</span>}
      </button>
      {/* It opens outside the review's frame, so it brings the frame's tokens along, as the sheet does. */}
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent data-landing className="dark" initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>{applyTitle(count)}</AlertDialogTitle>
            <AlertDialogDescription>
              These candidates will see their new status in their application on Callback, with the text you
              wrote for that step. No email is sent for a status
              {withInterview.length > 0 ? "; an interview invitation is an email, with a Google Meet link once they confirm." : "."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="l-scroll -mx-1 max-h-[55vh] overflow-y-auto px-1">
            <PendingChangeList changes={changes} options={options} />
            {withInterview.length > 0 && (
              <ul aria-label="Interview invitations" className="mt-4 grid gap-4">
                {withInterview.map((change) => (
                  <li key={change.id} className="grid gap-2 rounded-lg border p-3">
                    <p className="text-sm font-medium">Interview with {change.name}</p>
                    <InterviewScheduleFields
                      idPrefix={`interview-${change.id}`}
                      draft={draftFor(change.id)}
                      onChange={(patch) => setDrafts((all) => ({ ...all, [change.id]: { ...draftFor(change.id), ...patch } }))}
                      timeZone={timeZone}
                      problem={problems.get(change.id) ?? null}
                      google={interviews.google}
                      settingsHref={interviews.settingsHref}
                      showToggle
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" disabled={pending || count === 0 || blocked} onClick={onConfirm}>
              {pending ? "Applying…" : "Apply statuses"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function applyTitle(count: number): string {
  return count === 1 ? "Apply 1 status?" : `Apply ${count} statuses?`;
}

// Each pending change, "Ana Novak: Applied → Interview". Names are plain text, never HTML.
export function PendingChangeList({
  changes,
  options,
}: {
  changes: readonly PendingStageChange[];
  options: readonly StageOption[];
}) {
  return (
    <ul aria-label="Pending statuses" className="l-scroll flex max-h-56 flex-col gap-1.5 overflow-y-auto text-sm">
      {changes.map((change) => (
        <li key={change.id} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span className="font-medium">{change.name}</span>
          <span className="inline-flex items-baseline gap-1 text-muted-foreground">
            {choiceLabel(change.from, options)}
            <ArrowRightIcon aria-label="to" className="size-3 self-center" />
            <span className="text-foreground">{choiceLabel(change.to, options)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
