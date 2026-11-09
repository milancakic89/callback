"use client";

import { useRef, useState, useTransition } from "react";
import { withdrawMyApplication } from "@/app/(app)/applications/actions";
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

// Asks first: withdrawing can't be undone. The dialog stays open while the action runs and shows its
// error instead of closing on a failure; Cancel takes the initial focus. It is on the job's own page
// (features/callback-applications-in-table.md), where the candidate's application to it is shown.
export function WithdrawButton({
  applicationId,
  jobTitle,
  companyName,
}: {
  applicationId: string;
  jobTitle: string;
  companyName: string;
}) {
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
      const result = await withdrawMyApplication(applicationId);
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(true)}>
        Withdraw
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw your application?</AlertDialogTitle>
            <AlertDialogDescription>
              {companyName} loses access to your CV, your cover letter is deleted, and you can&apos;t apply to{" "}
              {jobTitle} again.
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
              {pending ? "Withdrawing…" : "Yes, withdraw"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
