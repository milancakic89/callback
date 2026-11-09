import "server-only";
import { documentStore } from "@/lib/storage/documents";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { screenCv, screeningEngine } from "./index";

// Checks a job's applications again (features/cv-screening.md), after its filters changed or
// applicants were moved to it. The results of the job's active applications are cleared first, so the
// reviewer sees "Not checked yet" and never an answer to filters the job no longer has; then each CV
// is read from storage and checked, one at a time, and the result saved. A failure on one application
// is logged and skipped: the others still get theirs. Meant to run after the response
// (`after()` in the employer actions), so nobody waits for it.
//
// Safe to run twice at once: save_screening() only writes a result made for the filters the job has
// at that moment, so the older run's answers are refused once a newer edit is in.
export async function rescreenJob(jobId: string): Promise<void> {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("job_postings")
    .select("required_filters, optional_filters, is_demo")
    .eq("id", jobId)
    .maybeSingle<{ required_filters: string[]; optional_filters: string[]; is_demo: boolean }>();
  if (jobError) {
    console.error("rescreenJob job failed:", jobError.code, jobError.message);
    return;
  }
  // The demo job's filters can't change, and its matches are written by hand.
  if (!job || job.is_demo) return;
  const filters = { required: job.required_filters, optional: job.optional_filters };

  const { error: clearError } = await supabaseAdmin
    .from("job_applications")
    .update({
      matched_filters: null,
      unverified_filters: null,
      screening_outcome: null,
      screened_at: null,
      screening_engine: null,
    })
    .eq("job_posting_id", jobId)
    .is("withdrawn_at", null);
  if (clearError) {
    console.error("rescreenJob clear failed:", clearError.code, clearError.message);
    return;
  }
  if (filters.required.length + filters.optional.length === 0) return;

  const { data: applications, error: listError } = await supabaseAdmin
    .from("job_applications")
    .select("id, cv_path")
    .eq("job_posting_id", jobId)
    .is("withdrawn_at", null)
    .returns<{ id: string; cv_path: string | null }[]>();
  if (listError) {
    console.error("rescreenJob list failed:", listError.code, listError.message);
    return;
  }

  for (const application of applications ?? []) {
    if (!application.cv_path) continue;
    try {
      const stream = await documentStore.get(application.cv_path);
      if (!stream) continue;
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      const columns = await screenCv({ bytes, fileName: application.cv_path.split("/").at(-1) ?? "cv.pdf" }, filters);
      if (!columns) continue;

      const { error } = await supabaseAdmin.rpc("save_screening", {
        p_application_id: application.id,
        p_required: filters.required,
        p_optional: filters.optional,
        p_matched: columns.matched_filters,
        p_unverified: columns.unverified_filters,
        p_outcome: columns.screening_outcome,
        p_engine: screeningEngine.id,
      });
      if (error) console.error("rescreenJob save failed:", application.id, error.code, error.message);
    } catch (error) {
      console.error("rescreenJob failed for application", application.id, error);
    }
  }
}
