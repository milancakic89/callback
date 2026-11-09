"use client";

import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CandidateStage } from "./candidate-stage";
import {
  CALLBACK_APPLICATION_STATE_LABELS,
  type CallbackApplication,
  type CallbackApplicationState,
} from "@/lib/cvs/types";
import { formatAbsolute } from "@/lib/jobs/format";
import { postingPath } from "@/lib/jobs/published";
import { documentUrl } from "@/lib/review/documents";
import { cn } from "cn";

// Explicit so the day doesn't depend on whether the server or the browser formats it.
const TIME_ZONE = "Europe/Belgrade";

const STATE_CLASS: Record<CallbackApplicationState, string> = {
  active: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  paused: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  withdrawn: "bg-muted text-muted-foreground",
  you_withdrew: "bg-muted text-muted-foreground",
};

// "Applied on Callback" on /applications (features/candidate-cvs.md): the candidate's applications to
// jobs companies posted here, above their own tracker. Each shows where it stands, the CV it uses and
// the cover letter; an active or paused one can be withdrawn, which ends the company's access.
export function CallbackApplications({ items }: { items: CallbackApplication[] }) {
  return (
    <section
      aria-labelledby="callback-applications"
      className="flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10 md:max-h-[45%] md:shrink-0"
    >
      <div className="px-4 pt-4 pb-3">
        <h2 id="callback-applications" className="font-heading text-base font-medium">
          Applied on Callback
        </h2>
        <p className="text-sm text-muted-foreground">
          The company can read your CV and cover letter while an application is active.
        </p>
      </div>
      <ul className="divide-y border-t md:min-h-0 md:overflow-y-auto">
        {items.map((item) => (
          <CallbackApplicationRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function CallbackApplicationRow({ item }: { item: CallbackApplication }) {
  const holdsDocuments = item.state === "active" || item.state === "paused";

  return (
    <li className="grid gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-0.5">
          <Link
            href={postingPath(item.jobId)}
            className="truncate font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {item.title}
          </Link>
          <p className="text-sm text-muted-foreground">
            {item.companyName} · Applied {formatAbsolute(item.appliedAt, TIME_ZONE)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.status && <CandidateStage status={item.status} />}
          <Badge className={cn(STATE_CLASS[item.state])}>{CALLBACK_APPLICATION_STATE_LABELS[item.state]}</Badge>
          {holdsDocuments && <WithdrawButton item={item} />}
        </div>
      </div>

      {holdsDocuments && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {item.cvFileName && (
            <a
              href={documentUrl(item.id, "cv")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <FileTextIcon aria-hidden className="size-4 shrink-0" />
              <span className="truncate">CV: {item.cvFileName}</span>
            </a>
          )}
          {item.coverLetter?.kind === "pdf" && (
            <a
              href={documentUrl(item.id, "cover-letter")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ExternalLinkIcon aria-hidden className="size-4" /> Cover letter (PDF)
            </a>
          )}
          {!item.coverLetter && <span className="text-muted-foreground">No cover letter</span>}
        </div>
      )}
      {holdsDocuments && item.coverLetter?.kind === "text" && (
        <details className="group text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Your cover letter</summary>
          {/* Plain text, never HTML: it is what the candidate typed. */}
          <p className="mt-2 rounded-lg bg-muted/50 p-3 leading-relaxed whitespace-pre-wrap">{item.coverLetter.text}</p>
        </details>
      )}
    </li>
  );
}

// Asks first: withdrawing can't be undone. The dialog stays open while the action runs and shows its
// error instead of closing on a failure; Cancel takes the initial focus.
function WithdrawButton({ item }: { item: CallbackApplication }) {
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
      const result = await withdrawMyApplication(item.id);
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
              {item.companyName} loses access to your CV, your cover letter is deleted, and you can&apos;t
              apply to {item.title} again.
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
