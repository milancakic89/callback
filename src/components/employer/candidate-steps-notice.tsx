import { ArrowRightIcon, ListChecksIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { settingsPath } from "@/lib/companies/candidate-steps";
import type { CandidateStep } from "@/lib/review/stages";

// In the job editor (features/candidate-steps.md): the company's candidate steps are set once, in its
// settings, and every job uses them. Without any, a button leads there; with some, one line shows the
// pipeline a candidate will move through, with a link to change it. No hooks, so the server can render it.
export function CandidateStepsNotice({ steps, companySlug }: { steps: readonly CandidateStep[]; companySlug: string }) {
  const href = settingsPath(companySlug);

  if (steps.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
        <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-muted-foreground">
          <ListChecksIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Candidates see where their application stands. Add the steps your hiring process goes through; every job
            of yours uses them.
          </span>
        </p>
        <Link href={href} className={buttonVariants({ variant: "outline" })}>
          Add candidate steps
        </Link>
      </div>
    );
  }

  const ordered = [...steps].sort((first, second) => first.position - second.position);
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Candidate steps:</span>
      <ol aria-label="Candidate steps" className="contents">
        {["Applied", ...ordered.map((step) => step.name), "Offer"].map((name, index, names) => (
          <li key={`${index}-${name}`} className="inline-flex items-center gap-1.5">
            {name}
            {index < names.length - 1 && <ArrowRightIcon aria-hidden className="size-3" />}
          </li>
        ))}
      </ol>
      <Link
        href={href}
        className="rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Edit
      </Link>
    </div>
  );
}
