"use server";

import { requireAccountType } from "@/lib/auth/dal";
import {
  candidateStepsSchema,
  stepFieldErrors,
  STEPS_SAVED_MESSAGE,
  toCandidateStep,
  type CandidateStepsFormState,
  type CompanyStepRow,
} from "@/lib/companies/candidate-steps";
import { rateLimit } from "@/lib/rate-limit";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

// The settings form for the company's candidate steps (src/components/employer/candidate-steps-editor.tsx,
// features/candidate-steps.md), through useActionState. The whole list is sent, in order, as JSON in
// one hidden field. Which company is the session's: the RPC finds it from the caller, never from the
// form, and checks what spans rows (10 steps at most, a step in use can't be deleted, names are
// unique) in the database. Nothing is cached, so there is nothing to expire: the review screen and
// the job editor read the steps fresh.

function parseRows(formData: FormData): unknown {
  const value = formData.get("steps");
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// The RPC's `step_in_use` carries the step's name in DETAIL.
type RpcError = { code?: string; message: string; details?: string | null };

export async function saveCandidateSteps(
  _prev: CandidateStepsFormState,
  formData: FormData,
): Promise<CandidateStepsFormState> {
  const parsed = candidateStepsSchema.safeParse(parseRows(formData));
  if (!parsed.success) return { fieldErrors: stepFieldErrors(parsed.error) };

  const user = await requireAccountType("employer");
  if (!user.companySlug) return { error: "Set up your company first." };

  const { success } = await rateLimit({
    key: `candidate-steps:${user.id}`,
    limit: 30,
    windowMs: 60 * 60_000,
    store: postgresStore,
  });
  if (!success) return { error: "You've saved the steps a lot. Try again in an hour." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_company_steps", {
    p_steps: parsed.data.map((step) => ({ id: step.id, name: step.name, description: step.description })),
  });
  if (error) return failure(error);

  return { message: STEPS_SAVED_MESSAGE, steps: ((data ?? []) as CompanyStepRow[]).map(toCandidateStep) };
}

function failure(error: RpcError): CandidateStepsFormState {
  if (error.message === "step_in_use") {
    const name = error.details ? `“${error.details}”` : "A step";
    return { error: `${name} has been used, so it can't be deleted. Rename it instead.` };
  }
  if (error.code === "23505") return { error: "Two steps can't have the same name." };
  if (error.code === "23514") return { error: "Check the steps: a name or a text is not allowed." };
  console.error("saveCandidateSteps failed:", error.code, error.message);
  return { error: "Could not save the steps. Try again." };
}
