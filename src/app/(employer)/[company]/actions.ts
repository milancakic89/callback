"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAccountType } from "@/lib/auth/dal";
import { companyHome, TEST_COMPANY } from "@/lib/companies/company";
import { jobPostingSchema } from "@/lib/companies/job-posting";
import { ensureEmployerWorkspace } from "@/lib/companies/workspace";
import { rateLimit } from "@/lib/rate-limit";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

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

  // Every employer belongs to the fixture company until slugs come from the account.
  redirect(companyHome(TEST_COMPANY));
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

  const { data, error } = await supabase.from("job_postings").delete().eq("id", parsed.data.jobId).select("id");
  if (error) return { ok: false, error: "Could not delete. Try again." };
  if (!data?.length) return { ok: false, error: "Job not found." };

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
    .select("id");
  if (error) return { error: "Could not save the changes. Try again." };
  if (!data?.length) return { error: "Job not found." };

  redirect(companyHome(TEST_COMPANY));
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
// Publishing only stores that the job is published: it isn't on the job board yet. The RPC finds the
// job through the caller's company, so another company's id answers "Job not found.".
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
// to the job's active applicants is the employer's choice: `keep` leaves them (a pause), `withdraw`
// marks them withdrawn (nobody is told yet), `move` moves them to `targetJobId`. The RPC does it all
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

  refresh();
  return { ok: true };
}
