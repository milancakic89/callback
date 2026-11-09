"use client";

import { ExternalLinkIcon, FileTextIcon, LockIcon, Trash2Icon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { deleteCv } from "@/app/(app)/profile/actions";
import { CvUploadButton } from "@/components/cvs/cv-upload-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_CVS } from "@/lib/applications/apply-schema";
import { cvUrl, formatFileSize, type CandidateCv } from "@/lib/cvs/types";
import { formatAbsolute } from "@/lib/jobs/format";

// Explicit so the day doesn't depend on whether the server or the browser formats it.
const TIME_ZONE = "Europe/Belgrade";

// "Your CVs" (features/candidate-cvs.md): the CVs on the candidate's account, newest first. Each opens
// in a new tab. One in use by an active application can't be deleted, and says where it is in use;
// the server refuses too, should an application arrive in between. Uploading is hidden at 5.
export function CvList({ cvs }: { cvs: CandidateCv[] }) {
  const [error, setError] = useState<string | null>(null);
  const full = cvs.length >= MAX_CVS;

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1.5">
          <CardTitle className="text-xl">
            Your CVs{" "}
            <span className="font-normal text-muted-foreground">
              ({cvs.length} of {MAX_CVS})
            </span>
          </CardTitle>
          <CardDescription>
            PDFs up to 5 MB. When you apply, the company can read the CV you chose for as long as your
            application is active.
          </CardDescription>
        </div>
        {!full && <CvUploadButton variant="default" className="shrink-0" onUploaded={() => setError(null)} onError={setError} />}
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {full && (
          <p className="text-sm text-muted-foreground">You have {MAX_CVS} CVs. Delete one to upload another.</p>
        )}
        {cvs.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center">
            <FileTextIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              No CVs yet. Upload one here, or when you apply to a job.
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {cvs.map((cv) => (
              <CvRow key={cv.id} cv={cv} onError={setError} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CvRow({ cv, onError }: { cv: CandidateCv; onError: (message: string | null) => void }) {
  const locked = cv.activeOn.length > 0;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <FileTextIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="truncate font-medium">{cv.fileName}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(cv.sizeBytes)} · Uploaded {formatAbsolute(cv.createdAt, TIME_ZONE)}
        </p>
        {locked && (
          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <LockIcon aria-hidden className="mt-px size-3 shrink-0" />
            <span>Active on: {cv.activeOn.join(", ")}</span>
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={cvUrl(cv.id)} target="_blank" rel="noopener noreferrer" />}
        >
          <ExternalLinkIcon aria-hidden /> Open
        </Button>
        {locked ? (
          <Tooltip>
            <TooltipTrigger
              render={
                // A disabled button gets no pointer events, so the tooltip sits on a wrapper.
                <span tabIndex={0} className="rounded-md focus-visible:outline-2 focus-visible:outline-ring" />
              }
            >
              <Button type="button" variant="outline" size="sm" disabled aria-label={`Delete ${cv.fileName} (in use)`}>
                <LockIcon aria-hidden /> Delete
              </Button>
            </TooltipTrigger>
            <TooltipContent>In use by an active application</TooltipContent>
          </Tooltip>
        ) : (
          <DeleteCvButton cv={cv} onError={onError} />
        )}
      </div>
    </li>
  );
}

// Asks first. The dialog stays open while the action runs and shows its error instead of closing on a
// failure; Cancel takes the initial focus, so Enter right after it opens can't delete by accident.
function DeleteCvButton({ cv, onError }: { cv: CandidateCv; onError: (message: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setError(null);
      onError(null);
    }
  }

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCv(cv.id);
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(true)}>
        <Trash2Icon aria-hidden /> Delete
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this CV?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{cv.fileName}&rdquo; will be removed from your account. This can&apos;t be undone.
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
