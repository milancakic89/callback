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
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { unpublishJobPosting } from "@/app/(employer)/[company]/actions";

// Another job of the company that the applicants can be moved to (never the demo job).
export type MoveTarget = { id: string; title: string; published: boolean };

type Choice = "withdraw" | "move" | "keep";

const OPTIONS: { value: Choice; title: string; body: string }[] = [
  {
    value: "withdraw",
    title: "Tell them the job is closed",
    body: "Their applications are marked as withdrawn. Candidates aren't emailed yet.",
  },
  {
    value: "move",
    title: "Move them to another job",
    body: "For a job that was posted twice. Applicants who already applied there aren't duplicated.",
  },
  {
    value: "keep",
    title: "Keep them on this job",
    body: "A pause: their applications stay as they are.",
  },
];

// Unpublishing a published job (features/job-publishing.md). With no active applicants it is a plain
// confirmation. With some, the employer has to say what happens to them (three radio cards, none
// preselected, as in the account type dialog) and, for a move, which job they go to. The dialog stays
// open while the action runs and shows its error instead of closing on a failure; Cancel takes the
// initial focus. On success the action refreshes the dashboard, where the card offers Publish again.
export function UnpublishJobButton({
  jobId,
  title,
  applicantCount,
  targets,
}: {
  jobId: string;
  title: string;
  applicantCount: number;
  targets: MoveTarget[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const hasApplicants = applicantCount > 0;
  const ready = !hasApplicants || (choice !== null && (choice !== "move" || targetId !== null));

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setError(null);
      setChoice(null);
      setTargetId(null);
    }
  }

  function onConfirm() {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const result = await unpublishJobPosting({
        jobId,
        applicants: hasApplicants ? (choice ?? "keep") : "keep",
        targetJobId: choice === "move" ? (targetId ?? undefined) : undefined,
      });
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Unpublish
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent
          initialFocus={cancelRef}
          className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish this job?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasApplicants ? (
                <>
                  &ldquo;{title}&rdquo; goes back to being a draft.{" "}
                  {applicantCount === 1 ? "1 person has" : `${applicantCount} people have`} applied. What should
                  happen to {applicantCount === 1 ? "their application" : "their applications"}?
                </>
              ) : (
                <>&ldquo;{title}&rdquo; goes back to being a draft.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {hasApplicants && (
            <fieldset className="grid gap-2" disabled={pending}>
              <legend className="sr-only">What happens to the applicants</legend>
              {OPTIONS.map(({ value, title: optionTitle, body }) => {
                const unavailable = value === "move" && targets.length === 0;
                return (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/60",
                      "has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                      "has-disabled:cursor-not-allowed has-disabled:opacity-60 has-disabled:hover:bg-transparent",
                    )}
                  >
                    <input
                      type="radio"
                      name="applicants"
                      value={value}
                      checked={choice === value}
                      onChange={() => setChoice(value)}
                      disabled={unavailable}
                      className="sr-only"
                    />
                    <span className="grid flex-1 gap-1">
                      <span className="text-sm font-medium">{optionTitle}</span>
                      <span className="text-sm text-muted-foreground">
                        {unavailable ? "You have no other job to move them to." : body}
                      </span>
                      {value === "move" && choice === "move" && (
                        <Select value={targetId} onValueChange={(next) => setTargetId(next)}>
                          <SelectTrigger className="mt-1 w-full" aria-label="Job to move the applicants to">
                            <SelectValue>
                              {(selected: string | null) =>
                                targets.find((target) => target.id === selected)?.title ?? "Choose a job"
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            {targets.map((target) => (
                              <SelectItem key={target.id} value={target.id}>
                                {target.title}
                                <span className="text-muted-foreground">
                                  {target.published ? "Published" : "Draft"}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" disabled={pending || !ready} onClick={onConfirm}>
              {pending ? "Unpublishing…" : "Unpublish"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
