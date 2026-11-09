"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { homeFor } from "@/lib/auth/account-type";
import { requireAccountType } from "@/lib/auth/dal";
import { jobPostingSchema } from "@/lib/companies/job-posting";
import { ensureEmployerWorkspace } from "@/lib/companies/workspace";
import { rateLimit } from "@/lib/rate-limit";
import { isValidChoice, PIPELINE_STAGES, type PipelineStage, type StageChoice } from "@/lib/review/stages";
import { rescreenJob } from "@/lib/screening/rescreen";
import { sameFilters } from "@/lib/screening/same-filters";
import { drainStorageDeletions } from "@/lib/storage/deletions";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

// The cache tag of the job list, descriptions and postings (src/lib/jobs/queries.ts). Publishing,
// unpublishing, deleting or editing a published job expires it, so the job board follows at once.
// updateTag, not revalidateTag: these are Server Actions, and the employer who clicked must see the
// result on the very next page, not a stale one (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md).
const JOBS_CACHE_TAG = "jobs";

const inputSchema = z.object({
  jobId: z.uuid(),
});

export type JobFormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// A field sent once per chip (one hidden input each): every string entry, in order.
function listField(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === "string");
}

// What the job form submits, for jobPostingSchema; shared by creating and editing a job.
function jobPostingFields(formData: FormData) {
  return {
    title: textField(formData, "title"),
    description: textField(formData, "description"),
    location: textField(formData, "location"),
    workMode: textField(formData, "workMode"),
    requiredFilters: listField(formData, "requiredFilters"),
    optionalFilters: listField(formData, "optionalFilters"),
  };
}

// The "Create job" form (src/components/employer/job-editor.tsx), through useActionState. The company
// comes from the session, never from the form: ensure_employer_workspace() answers the caller's own
// company id (and makes the company if the employer opens the form before their first dashboard
// visit), and the insert policy only lets a company insert into its own row. `is_demo` isn't in the
// column grant, so a posted job is never a demo. On success it redirects to the dashboard, which
// reads per request and shows the new job first. See features/post-job.md.
export async function createJobPosting(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  const parsed = jobPostingSchema.safeParse(jobPostingFields(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const user = await requireAccountType("employer");

  const { success } = await rateLimit({
    key: `create-job:${user.id}`,
    limit: 20,
    windowMs: 60 * 60_000,
    store: postgresStore,
  });
  if (!success) return { error: "You've posted a lot of jobs. Try again in an hour." };

  const failure: JobFormState = { error: "Could not save the job. Try again." };

  let companyId: string;
  try {
    companyId = await ensureEmployerWorkspace();
  } catch {
    return failure;
  }

  const supabase = await createClient();
  const { title, description, location, workMode, requiredFilters, optionalFilters } = parsed.data;
  const { error } = await supabase.from("job_postings").insert({
    company_id: companyId,
    title,
    description,
    location_raw: location,
    work_mode: workMode,
    required_filters: requiredFilters,
    optional_filters: optionalFilters,
  });
  if (error) return failure;

  redirect(homeFor(user.accountType, user.companySlug));
}

export type DeleteJobPostingResult = { ok: true } | { ok: false; error: string };

// Called directly from the confirm dialog on a job card (src/components/employer/delete-job-button.tsx),
// not a form. Row level security only lets a company delete its own jobs, so another company's id
// deletes nothing and answers "Job not found". The job's applications go with it (on delete
// cascade); the candidates stay. See features/demo-job.md.
export async function deleteJobPosting(jobId: string): Promise<DeleteJobPostingResult> {
  const parsed = inputSchema.safeParse({ jobId });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("employer");

  const { success } = await rateLimit({
    key: `delete-job:${user.id}`,
    limit: 30,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_postings")
    .delete()
    .eq("id", parsed.data.jobId)
    .select("id, published_at");
  if (error) return { ok: false, error: "Could not delete. Try again." };
  if (!data?.length) return { ok: false, error: "Job not found." };
  // A published job is on the job board: take it off at once (features/apply-with-cv.md).
  if (data[0].published_at) updateTag(JOBS_CACHE_TAG);
  // The applications went with the job, and their cover letters were queued for deletion
  // (features/candidate-cvs.md); the candidates' CVs stay on their accounts.
  after(drainStorageDeletions);

  // The dashboard is a Server Component: this re-renders it without the job.
  refresh();
  return { ok: true };
}

// The edit form (src/components/employer/job-editor.tsx with a `job`), through useActionState. Same
// fields and limits as createJobPosting. The job id comes from a hidden input, so it is validated and
// then trusted no further than row level security: the update policy only matches the caller's own
// jobs, and never the demo job, so any other id changes no row and answers "Job not found.".
// `published_at` isn't in the update grant: editing never publishes or unpublishes.
export async function updateJobPosting(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  const jobId = z.uuid().safeParse(textField(formData, "jobId"));
  if (!jobId.success) return { error: "Invalid request." };

  const parsed = jobPostingSchema.safeParse(jobPostingFields(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const user = await requireAccountType("employer");

  const { success } = await rateLimit({
    key: `edit-job:${user.id}`,
    limit: 60,
    windowMs: 60 * 60_000,
    store: postgresStore,
  });
  if (!success) return { error: "You've made a lot of changes. Try again in an hour." };

  const supabase = await createClient();
  const { title, description, location, workMode, requiredFilters, optionalFilters } = parsed.data;
  // What the job's filters are now, to tell whether this edit changes them: if it does, the job's
  // applications are checked again against the new ones (features/cv-screening.md).
  const { data: before } = await supabase
    .from("job_postings")
    .select("required_filters, optional_filters")
    .eq("id", jobId.data)
    .maybeSingle<{ required_filters: string[]; optional_filters: string[] }>();
  const { data, error } = await supabase
    .from("job_postings")
    .update({
      title,
      description,
      location_raw: location,
      work_mode: workMode,
      required_filters: requiredFilters,
      optional_filters: optionalFilters,
    })
    .eq("id", jobId.data)
    .select("id, published_at");
  if (error) return { error: "Could not save the changes. Try again." };
  if (!data?.length) return { error: "Job not found." };
  // A published job is on the job board with its title and text: show the edit at once. A draft is
  // on no page but its owner's, so it leaves the cached job list alone.
  if (data[0].published_at) updateTag(JOBS_CACHE_TAG);
  // After the response: reading every CV takes a while, and the employer doesn't wait for it. Until it
  // is done the review screen says "Not checked yet" (the first thing the re-check does).
  const filtersChanged =
    before !== null &&
    !sameFilters(
      { required: before.required_filters, optional: before.optional_filters },
      { required: requiredFilters, optional: optionalFilters },
    );
  if (filtersChanged) after(() => rescreenJob(jobId.data));

  redirect(homeFor(user.accountType, user.companySlug));
}

export type JobStateResult = { ok: true } | { ok: false; error: string };

// What the publish and unpublish RPCs (supabase/migrations/20261030140000_job_publishing.sql) raise.
function jobStateError(error: { code?: string }): string {
  switch (error.code) {
    case "P0002":
      return "Job not found.";
    case "55000":
      return "This job is already unpublished.";
    case "22023":
      return "Choose another of your jobs to move the applicants to.";
    default:
      return "Could not save. Try again.";
  }
}

// Called from the confirm dialog on a job card (src/components/employer/publish-job-button.tsx).
// Publishing puts the job on the job board (features/apply-with-cv.md). The RPC finds the job
// through the caller's company, so another company's id answers "Job not found.".
// See features/job-publishing.md.
export async function publishJobPosting(jobId: string): Promise<JobStateResult> {
  const parsed = inputSchema.safeParse({ jobId });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("employer");

  const { success } = await rateLimit({
    key: `publish-job:${user.id}`,
    limit: 30,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_job_posting", { p_job_id: parsed.data.jobId });
  if (error) return { ok: false, error: jobStateError(error) };

  updateTag(JOBS_CACHE_TAG);
  refresh();
  return { ok: true };
}

const unpublishSchema = z
  .object({
    jobId: z.uuid(),
    applicants: z.enum(["keep", "withdraw", "move"]),
    targetJobId: z.uuid().optional(),
  })
  // Moving needs a different job to move to; the RPC checks that it is the company's own.
  .refine((value) => value.applicants !== "move" || (value.targetJobId && value.targetJobId !== value.jobId));

export type UnpublishJobInput = z.input<typeof unpublishSchema>;

// Called from the unpublish dialog (src/components/employer/unpublish-job-button.tsx). What happens
// to the job's active applicants is the employer's choice: `keep` leaves them (a pause, their CVs stay
// locked), `withdraw` marks them withdrawn and clears their documents (nobody is told yet), `move`
// moves them to `targetJobId`. The RPC does it all
// in one transaction, so a failed move leaves the job published with its applicants.
export async function unpublishJobPosting(input: UnpublishJobInput): Promise<JobStateResult> {
  const parsed = unpublishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("employer");

  const { success } = await rateLimit({
    key: `publish-job:${user.id}`,
    limit: 30,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const { jobId, applicants, targetJobId } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("unpublish_job_posting", {
    p_job_id: jobId,
    p_applicants: applicants,
    p_target_job_id: applicants === "move" ? (targetJobId ?? null) : null,
  });
  if (error) return { ok: false, error: jobStateError(error) };

  updateTag(JOBS_CACHE_TAG);
  // The moved applications carry the results made for the old job's filters: check them again for
  // this one's (features/cv-screening.md).
  if (applicants === "move" && targetJobId) after(() => rescreenJob(targetJobId));
  // Withdrawn applications give up their documents, and a move can drop an application or withdraw
  // it: the cover letters they let go of were queued for deletion (features/candidate-cvs.md).
  if (applicants !== "keep") after(drainStorageDeletions);
  refresh();
  return { ok: true };
}

export type ReviewMarkResult = { ok: true } | { ok: false; error: string };

// The review screen's marks on an application (features/applicant-review.md), called straight from
// it, not from a form. The screen shows the change at once and puts it back if this fails, so nothing
// is refreshed. The update policy only matches active applications to the caller's own jobs and the
// column grant only covers these columns, so any other id changes no row and answers "Application not
// found.". They share one limit, far above what clicking through applicants needs.
async function setReviewMark(
  applicationId: string,
  values:
    | { viewed_at: string }
    | { liked_at: string | null }
    | { pipeline_stage: PipelineStage; step_id: string | null; stage_changed_at: string },
): Promise<ReviewMarkResult> {
  const parsed = z.uuid().safeParse(applicationId);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("employer");

  const { success } = await rateLimit({
    key: `review-mark:${user.id}`,
    limit: 120,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("job_applications").update(values).eq("id", parsed.data).select("id");
  if (error) return { ok: false, error: "Could not save. Try again." };
  if (!data?.length) return { ok: false, error: "Application not found." };

  return { ok: true };
}

// Next on the review screen. `viewed_at` is when it was last marked; the screen only calls this for
// an application it doesn't show as viewed yet.
export async function markApplicationViewed(applicationId: string): Promise<ReviewMarkResult> {
  return setReviewMark(applicationId, { viewed_at: new Date().toISOString() });
}

// The heart next to Next: a note for later ("we liked this one"), nothing more.
export async function setApplicationLiked(applicationId: string, liked: boolean): Promise<ReviewMarkResult> {
  if (typeof liked !== "boolean") return { ok: false, error: "Invalid request." };
  return setReviewMark(applicationId, { liked_at: liked ? new Date().toISOString() : null });
}

const stageChoiceSchema = z
  .object({ stage: z.enum(PIPELINE_STAGES), stepId: z.uuid().nullable() })
  .refine(isValidChoice, "A step names which one, and nothing else does.");

// The status control on the review screen (features/candidate-steps.md). Any status can change to any
// other. The employer sees it at once; the candidate sees it only after applyApplicationStages. A step
// that isn't the company's is refused by the database (the trigger on job_applications).
export async function setApplicationStage(applicationId: string, choice: StageChoice): Promise<ReviewMarkResult> {
  const parsed = stageChoiceSchema.safeParse(choice);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  return setReviewMark(applicationId, {
    pipeline_stage: parsed.data.stage,
    step_id: parsed.data.stepId,
    stage_changed_at: new Date().toISOString(),
  });
}

const stageChangeSchema = z
  .object({ id: z.uuid(), stage: z.enum(PIPELINE_STAGES), stepId: z.uuid().nullable() })
  .refine(isValidChoice, "A step names which one, and nothing else does.");

const applyStagesSchema = z.object({
  jobId: z.uuid(),
  // The most a job's review screen can hold at once is far below this; it only bounds the request.
  changes: z.array(stageChangeSchema).min(1).max(500),
});

export type ApplyStagesResult = { ok: true; appliedIds: string[] } | { ok: false; error: string };

// "Apply statuses" on the review screen (features/candidate-steps.md): shows the candidates the
// statuses the employer chose. `changes` is what the confirmation listed, and the database only
// updates an application that still stands where the employer saw it, so a change made in another tab
// meanwhile is not sent unseen. The ids it returns are the ones the candidates now see; the screen
// updates itself from them, so nothing is refreshed.
export async function applyApplicationStages(
  jobId: string,
  changes: { id: string; stage: PipelineStage; stepId: string | null }[],
): Promise<ApplyStagesResult> {
  const parsed = applyStagesSchema.safeParse({ jobId, changes });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("employer");

  const { success } = await rateLimit({
    key: `apply-stages:${user.id}`,
    limit: 30,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_application_stages", {
    p_job_id: parsed.data.jobId,
    p_changes: parsed.data.changes.map((change) => ({
      id: change.id,
      stage: change.stage,
      step_id: change.stepId,
    })),
  });
  if (error) {
    console.error("applyApplicationStages failed:", error.code, error.message);
    return { ok: false, error: "Could not apply the statuses. Try again." };
  }

  return { ok: true, appliedIds: (data ?? []) as string[] };
}
