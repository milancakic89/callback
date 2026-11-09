"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { applyFields, applySchema, CV_GONE_MESSAGE } from "@/lib/applications/apply-schema";
import { requireAccountType } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/rate-limit";
import { screenCv } from "@/lib/screening";
import type { ScreeningColumns } from "@/lib/screening/engine";
import { applicationDocumentPath } from "@/lib/review/documents";
import { documentStore } from "@/lib/storage/documents";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { postgresStore } from "@/lib/supabase/rate-limit-store";

export type ApplyFormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  // Set once the application is saved: the dialog shows the confirmation.
  appliedAt?: string;
};

const FAILURE = "Could not send your application. Try again.";

type AccountCv = { storage_key: string; file_name: string };

// The CV against the job's filters (features/cv-screening.md), for the columns of the application. The
// filters are read here with the secret key and go no further than the screening: they are private to
// the company, and nothing of them reaches the candidate. The CV is read from R2 only when the job has
// filters. Best effort: a job whose filters can't be read, a CV that can't be read from storage, or a
// screening that fails, gives null, and the application is made without a result ("Not checked yet"
// for the reviewer).
async function screenForJob(jobId: string, cv: AccountCv): Promise<ScreeningColumns | null> {
  const { data, error } = await supabaseAdmin
    .from("job_postings")
    .select("required_filters, optional_filters")
    .eq("id", jobId)
    .maybeSingle<{ required_filters: string[]; optional_filters: string[] }>();
  if (error || !data) {
    console.error("applyToJob job filters failed:", error?.code, error?.message);
    return null;
  }
  const filters = { required: data.required_filters, optional: data.optional_filters };
  if (filters.required.length + filters.optional.length === 0) return null;

  try {
    const stream = await documentStore.get(cv.storage_key);
    if (!stream) {
      console.error("applyToJob: the CV is not in storage:", cv.storage_key);
      return null;
    }
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    return await screenCv({ bytes, fileName: cv.file_name }, filters);
  } catch (error) {
    console.error("applyToJob reading the CV failed:", error);
    return null;
  }
}

// "Send application" in the apply dialog (features/candidate-cvs.md), through useActionState. The CV
// is one already on the candidate's account; the application only points to it. The candidate never
// writes to a table: after the checks below, the server inserts the application with the secret key,
// so every storage key in it comes from here and never from the form. In this order:
//   1. the form is valid (a PDF cover letter too: PDF by content, up to 5 MB; never both kinds);
//   2. the caller is a candidate, within 10 applications an hour;
//   3. the job is one a candidate can see on the job board, and they haven't applied to it;
//   4. the CV is theirs;
//   5. their profile (name, location) is saved, for the company to see;
//   6. a PDF cover letter goes to R2, under the application;
//   7. the CV is checked against the job's filters, if it has any (never a reason to refuse);
//   8. the application is inserted, with that result, and the cover letter is deleted again if that
//      fails.
export async function applyToJob(_prev: ApplyFormState, formData: FormData): Promise<ApplyFormState> {
  const parsed = await applySchema.safeParseAsync(applyFields(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { jobId, cvId, fullName, location, coverLetterText, coverLetter } = parsed.data;

  const user = await requireAccountType("candidate");

  const { success } = await rateLimit({
    key: `apply:${user.id}`,
    limit: 10,
    windowMs: 60 * 60_000,
    store: postgresStore,
  });
  if (!success) return { error: "You've sent a lot of applications. Try again in an hour." };

  // The same function the job board and the posting's page read: a job that isn't published, the
  // demo job, and one of a company that isn't set up are not there.
  const { data: open, error: jobError } = await supabaseAdmin.rpc("published_job_postings", { p_job_id: jobId });
  if (jobError) {
    console.error("applyToJob published_job_postings failed:", jobError.code, jobError.message);
    return { error: FAILURE };
  }
  if (!Array.isArray(open) || open.length === 0) {
    return { error: "This job is no longer accepting applications." };
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("job_applications")
    .select("id")
    .eq("job_posting_id", jobId)
    .eq("candidate_id", user.id)
    .maybeSingle();
  if (existingError) {
    console.error("applyToJob existing application failed:", existingError.code, existingError.message);
    return { error: FAILURE };
  }
  if (existing) return { error: "You have already applied to this job." };

  // By id and by owner: another candidate's CV is the same as no CV.
  const { data: cv, error: cvError } = await supabaseAdmin
    .from("candidate_cvs")
    .select("storage_key, file_name")
    .eq("id", cvId)
    .eq("user_id", user.id)
    .maybeSingle<AccountCv>();
  if (cvError) {
    console.error("applyToJob candidate_cvs failed:", cvError.code, cvError.message);
    return { error: FAILURE };
  }
  if (!cv) return { error: CV_GONE_MESSAGE };

  const { error: profileError } = await supabaseAdmin
    .from("candidate_profiles")
    .upsert({ user_id: user.id, full_name: fullName, location }, { onConflict: "user_id" });
  if (profileError) {
    console.error("applyToJob candidate_profiles failed:", profileError.code, profileError.message);
    return { error: FAILURE };
  }

  const applicationId = crypto.randomUUID();
  let coverLetterPath: string | null = null;
  if (coverLetter) {
    const path = applicationDocumentPath(applicationId, "cover-letter", coverLetter.name);
    try {
      await documentStore.put(path, new Uint8Array(await coverLetter.arrayBuffer()), "application/pdf");
      coverLetterPath = path;
    } catch (error) {
      console.error("applyToJob upload failed:", error);
      return { error: FAILURE };
    }
  }
  // Best effort: a file nobody will ever open is only clutter, and a failure here must not hide the
  // error the candidate is about to be shown.
  const discardCoverLetter = async () => {
    if (!coverLetterPath) return;
    await documentStore
      .delete(coverLetterPath)
      .catch((error) => console.error("applyToJob cleanup failed:", coverLetterPath, error));
  };

  const screening = await screenForJob(jobId, cv);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("job_applications")
    .insert({
      id: applicationId,
      job_posting_id: jobId,
      candidate_id: user.id,
      cv_id: cvId,
      // A copy of the CV's key: the document route and the re-check read the application's own path.
      cv_path: cv.storage_key,
      cover_letter_path: coverLetterPath,
      cover_letter_text: coverLetterText,
      ...screening,
    })
    .select("applied_at")
    .single<{ applied_at: string }>();
  if (insertError || !inserted) {
    await discardCoverLetter();
    // 23505: another request got in between the check and the insert.
    if (insertError?.code === "23505") return { error: "You have already applied to this job." };
    // 23503: the CV was deleted in the meantime.
    if (insertError?.code === "23503") return { error: CV_GONE_MESSAGE };
    console.error("applyToJob insert failed:", insertError?.code, insertError?.message);
    return { error: FAILURE };
  }

  // The posting's page reads the application per request: this shows the confirmation there.
  refresh();
  return { appliedAt: inserted.applied_at };
}
