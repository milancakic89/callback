"use client";

import { ArrowRightIcon, SendIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
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
import type { PendingStageChange } from "@/lib/review/pending-stages";
import { choiceLabel, type StageOption } from "@/lib/review/stages";

// "Apply statuses" on the review screen (features/candidate-steps.md). Choosing a status is saved at
// once but only the employer sees it; this shows all the pending ones to their candidates, after a
// confirmation that lists each change. The dialog stays open while it runs and shows an error instead
// of closing on a failure, and Cancel takes the initial focus, as in PublishJobButton.

export type ApplyOutcome = { ok: true; skipped: number } | { ok: false; error: string };

export function ApplyStagesButton({
  changes,
  options,
  onApply,
}: {
  changes: readonly PendingStageChange[];
  options: readonly StageOption[];
  onApply: (changes: PendingStageChange[]) => Promise<ApplyOutcome>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const count = changes.length;

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) setError(null);
  }

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await onApply([...changes]);
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
              wrote for that step. No email is sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <PendingChangeList changes={changes} options={options} />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" disabled={pending || count === 0} onClick={onConfirm}>
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
