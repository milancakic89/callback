"use client";

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
import { publishJobPosting } from "@/app/(employer)/[company]/actions";

// Publishing a draft (features/job-publishing.md) asks first, in the pattern of DeleteJobButton: the
// dialog stays open while the action runs and shows its error instead of closing on a failure, and
// Cancel takes the initial focus. On success the action refreshes the dashboard, where the card now
// offers Unpublish. The job isn't on the job board yet, and the text says so.
export function PublishJobButton({ jobId, title }: { jobId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) setError(null);
  }

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await publishJobPosting(jobId);
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Publish
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this job?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{title}&rdquo; will be marked as published. Candidates will see it once Callback jobs are
              on the job board.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" disabled={pending} onClick={onConfirm}>
              {pending ? "Publishing…" : "Yes, publish"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
