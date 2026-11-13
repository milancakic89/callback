import { z } from "zod";
import { MAX_CANDIDATE_STEPS, type CandidateStep } from "@/lib/review/stages";
import { text, tooLong } from "@/lib/validation/text-fields";

// A company's candidate steps (features/candidate-steps.md): the statuses between Applied and Offer,
// up to 10, each with a name and a text the candidate reads behind the info icon. Plain module: the
// settings form uses the limits and the list operations.

export const STEP_NAME_MAX = 60;
export const STEP_DESCRIPTION_MAX = 500;

// Applied, Offer ("Got offer" to the candidate) and Rejected are the pipeline's own.
export const RESERVED_STEP_NAMES = ["applied", "offer", "got offer", "rejected"] as const;

export const STEPS_SAVED_MESSAGE = "Saved. Candidates see a step once you apply statuses on the review screen.";

export function settingsPath(slug: string): string {
  return `/${slug}/settings`;
}

export type CandidateStepsFormState = {
  error?: string;
  message?: string;
  // The saved list, with the ids the new steps were given, which the form starts from again.
  steps?: CandidateStep[];
  // Keyed `steps` for the list, and `steps.0.name` / `steps.0.description` for a row.
  fieldErrors?: Record<string, string[] | undefined>;
};

// What the form sends for a step: no id for a new one.
export type StepInput = {
  id: string | null;
  name: string;
  description: string;
  schedulesInterview: boolean;
};

const stepSchema = z.object({
  id: z.uuid().nullable(),
  name: text.pipe(
    z
      .string()
      .min(1, "Give the step a name.")
      .max(STEP_NAME_MAX, tooLong(STEP_NAME_MAX))
      .refine((name) => !RESERVED_STEP_NAMES.includes(name.toLowerCase() as (typeof RESERVED_STEP_NAMES)[number]), {
        message: "Applied, Offer and Rejected are always there. Choose another name.",
      }),
  ),
  description: text.pipe(
    z
      .string()
      .min(1, "Tell the candidate what this step means.")
      .max(STEP_DESCRIPTION_MAX, tooLong(STEP_DESCRIPTION_MAX)),
  ),
  // Missing means not an interview step: a form from before this field existed still saves.
  schedulesInterview: z.boolean().default(false),
});

export const candidateStepsSchema = z
  .array(stepSchema)
  .max(MAX_CANDIDATE_STEPS, `Use at most ${MAX_CANDIDATE_STEPS} steps.`)
  .superRefine((steps, context) => {
    const seen = new Set<string>();
    steps.forEach((step, index) => {
      const key = step.name.toLowerCase();
      if (seen.has(key) && step.name) {
        context.addIssue({ code: "custom", path: [index, "name"], message: "Two steps can't have the same name." });
      }
      seen.add(key);
    });
  });

// The messages of a failed parse, by field: `steps.0.name`, and `steps` for the list as a whole.
export function stepFieldErrors(error: z.ZodError): Record<string, string[]> {
  const byField: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = ["steps", ...issue.path].join(".");
    (byField[field] ??= []).push(issue.message);
  }
  return byField;
}

// A row of company_steps, as the database sends it.
export type CompanyStepRow = {
  id: string;
  position: number;
  name: string;
  description: string;
  used_at: string | null;
  updated_at: string;
  schedules_interview: boolean;
};

export function toCandidateStep(row: CompanyStepRow): CandidateStep {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    description: row.description,
    usedAt: row.used_at,
    updatedAt: row.updated_at,
    schedulesInterview: row.schedules_interview,
  };
}

// --- The list the settings form edits ---------------------------------------------------------------

// A row in the form. `key` is only React's; `locked` is a step an application has been on, which can
// be renamed and moved but not deleted.
export type StepDraft = StepInput & { key: string; locked: boolean };

export function draftsFromSteps(steps: readonly CandidateStep[]): StepDraft[] {
  return [...steps]
    .sort((first, second) => first.position - second.position)
    .map((step) => ({
      key: step.id,
      id: step.id,
      name: step.name,
      description: step.description,
      schedulesInterview: step.schedulesInterview,
      locked: step.usedAt !== null,
    }));
}

export function canAddStep(drafts: readonly StepDraft[]): boolean {
  return drafts.length < MAX_CANDIDATE_STEPS;
}

export function addStep(drafts: readonly StepDraft[], key: string): StepDraft[] {
  if (!canAddStep(drafts)) return [...drafts];
  return [...drafts, { key, id: null, name: "", description: "", schedulesInterview: false, locked: false }];
}

export function canRemoveStep(draft: StepDraft): boolean {
  return !draft.locked;
}

// A used step can't be removed: the list comes back as it was.
export function removeStep(drafts: readonly StepDraft[], index: number): StepDraft[] {
  const draft = drafts[index];
  if (!draft || !canRemoveStep(draft)) return [...drafts];
  return drafts.filter((_, position) => position !== index);
}

export function moveStep(drafts: readonly StepDraft[], index: number, direction: "up" | "down"): StepDraft[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= drafts.length || target < 0 || target >= drafts.length) return [...drafts];
  const moved = [...drafts];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
}

export function updateStep(
  drafts: readonly StepDraft[],
  index: number,
  change: Partial<Pick<StepDraft, "name" | "description" | "schedulesInterview">>,
): StepDraft[] {
  return drafts.map((draft, position) => (position === index ? { ...draft, ...change } : draft));
}

export function toStepInputs(drafts: readonly StepDraft[]): StepInput[] {
  return drafts.map(({ id, name, description, schedulesInterview }) => ({ id, name, description, schedulesInterview }));
}
