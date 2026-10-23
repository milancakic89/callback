"use client";

import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { JobListItem } from "@/lib/jobs/types";

type ApplyConfirmDialogProps = {
  // Open while non-null. The explorer renders one of these for the whole table, not one per row.
  job: JobListItem | null;
  onCancel: () => void;
  onConfirm: (job: JobListItem) => void;
};

// Applying is one-way (features/applied.md), so the checkbox asks first. An alert dialog doesn't
// close on an outside click, only on Escape or Cancel. Cancel takes the initial focus, so pressing
// Enter right after it opens can't apply by accident.
export function ApplyConfirmDialog({ job, onCancel, onConfirm }: ApplyConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Keeps the text on screen while the dialog fades out, after `job` has already gone back to null
  // (adjusting state during render, as in jobs-explorer.tsx).
  const [shown, setShown] = useState(job);
  if (job && job !== shown) setShown(job);

  return (
    <AlertDialog open={job !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent initialFocus={cancelRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark as applied?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{shown?.title}&rdquo; at {shown?.companyName} will move to Applications. This can&apos;t be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => shown && onConfirm(shown)}>Yes, I applied</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
