"use client";

import { Trash2Icon } from "lucide-react";
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
import { deleteJobPosting } from "@/app/(employer)/[company]/actions";

// Deleting a job also deletes its applications (features/demo-job.md), so it asks first. The dialog
// stays open while the action runs and shows its error instead of closing on a failure. Cancel takes
// the initial focus, so pressing Enter right after it opens can't delete by accident. On success the
// action refreshes the dashboard, which unmounts this card.
export function DeleteJobButton({ jobId, title }: { jobId: string; title: string }) {
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
      const result = await deleteJobPosting(jobId);
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Trash2Icon aria-hidden /> Delete
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{title}&rdquo; and its applications will be removed. This can&apos;t be undone.
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
            <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
              {pending ? "Deleting…" : "Yes, delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
