import "server-only";
import { toCandidateStep, type CompanyStepRow } from "@/lib/companies/candidate-steps";
import type { CandidateStep } from "@/lib/review/stages";
import { createClient } from "@/lib/supabase/server";

// The signed-in employer's candidate steps, in their order (features/candidate-steps.md). Row level
// security shows a company only its own, so there is no company to name. Not cached, like the
// applicants: the review screen and the settings form must show what was just saved.
export async function getCandidateSteps(): Promise<CandidateStep[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_steps")
    .select("id, position, name, description, used_at, updated_at, schedules_interview")
    .order("position", { ascending: true })
    .returns<CompanyStepRow[]>();
  if (error) throw new Error(`getCandidateSteps: ${error.message}`);

  return (data ?? []).map(toCandidateStep);
}
