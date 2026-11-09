"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { saveCandidateSteps } from "@/app/(employer)/[company]/(workspace)/settings/actions";
import { FieldError, FormAlert } from "@/components/auth/form-feedback";
import { CandidateStepFields } from "@/components/employer/candidate-step-row";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  addStep,
  canAddStep,
  draftsFromSteps,
  moveStep,
  removeStep,
  toStepInputs,
  updateStep,
  type CandidateStepsFormState,
} from "@/lib/companies/candidate-steps";
import { MAX_CANDIDATE_STEPS, type CandidateStep } from "@/lib/review/stages";

const initialState: CandidateStepsFormState = {};

// The company's candidate steps (features/candidate-steps.md): Applied first and Offer and Rejected
// last are fixed; between them the company adds up to 10 steps of its own, each with a name and the text
// the candidate reads behind the info icon. The list lives in state and is sent whole, in order, as JSON
// in one hidden input, so a refused field doesn't wipe it. After saving, the form starts again from the
// saved list, which is how a new step gets its id.
export function CandidateStepsEditor({ steps, companySlug }: { steps: CandidateStep[]; companySlug: string }) {
  const [state, formAction, pending] = useActionState(saveCandidateSteps, initialState);
  const [drafts, setDrafts] = useState(() => draftsFromSteps(steps));
  const [seenState, setSeenState] = useState(state);

  // Starts again from the saved list when a save succeeds (React's way to reset state from a new result).
  if (state !== seenState) {
    setSeenState(state);
    if (state.steps) setDrafts(draftsFromSteps(state.steps));
  }

  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="grid max-w-3xl gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
      <FormAlert state={state} />
      <input type="hidden" name="steps" value={JSON.stringify(toStepInputs(drafts))} />
      <FieldError id="steps-error" errors={errors?.steps} />

      <ol aria-label="Candidate steps" className="grid gap-3">
        <FixedStep name="Applied" note="Every application starts here." />
        {drafts.map((draft, index) => (
          <CandidateStepFields
            key={draft.key}
            draft={draft}
            index={index}
            total={drafts.length}
            nameErrors={errors?.[`steps.${index}.name`]}
            descriptionErrors={errors?.[`steps.${index}.description`]}
            onChange={(change) => setDrafts((all) => updateStep(all, index, change))}
            onMove={(direction) => setDrafts((all) => moveStep(all, index, direction))}
            onRemove={() => setDrafts((all) => removeStep(all, index))}
          />
        ))}
        <FixedStep name="Offer" note="Candidates see it as “Got offer”." />
        <FixedStep name="Rejected" note="You can set it at any step." />
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!canAddStep(drafts)}
          onClick={() => setDrafts((all) => addStep(all, crypto.randomUUID()))}
        >
          <PlusIcon aria-hidden /> Add step
        </Button>
        <p className="text-sm text-muted-foreground">
          {drafts.length} of {MAX_CANDIDATE_STEPS} steps
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Candidates see a step only after you apply statuses on the review screen. Renaming a step or changing its
        text updates it for every candidate already on it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save steps"}
        </Button>
        <Link href={`/${companySlug}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Back to dashboard
        </Link>
      </div>
    </form>
  );
}

// A status that is always there and can't be edited.
function FixedStep({ name, note }: { name: string; note: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg bg-muted/50 px-3 py-2">
      <span className="font-medium">{name}</span>
      <span className="text-sm text-muted-foreground">{note}</span>
    </li>
  );
}
