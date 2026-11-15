"use client";

import { Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
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

// Asks first: removing a job takes its row, its status and the CV it names off the candidate's list.
// Only a job added from another site has it (features/chrome-extension.md); the job on that site is not
// touched. Cancel takes the initial focus, and Confirm closes the dialog at once: the table hides the
// row and puts it back with an error if the removal fails (applications-table.tsx), so nothing is
// kept waiting here.
export function RemoveExternalButton({
  jobTitle,
  companyName,
  sourceLabel,
  disabled,
  onConfirm,
}: {
  jobTitle: string;
  companyName: string;
  // "LinkedIn", "HelloWorld" or "Infostud": the site the job stays on.
  sourceLabel: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  function confirm() {
    setOpen(false);
    onConfirm();
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove "${jobTitle}" from your applications`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Trash2Icon aria-hidden />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this job?</AlertDialogTitle>
            <AlertDialogDescription>
              {jobTitle} at {companyName} is taken off your list. Nothing changes on {sourceLabel}, and you can add it
              again from its page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={confirm}>
              Yes, remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
