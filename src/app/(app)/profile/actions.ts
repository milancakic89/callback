"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { CV_GONE_MESSAGE, CV_LIMIT_MESSAGE, cvUploadFields, cvUploadSchema, MAX_CVS } from "@/lib/applications/apply-schema";
import { requireAccountType } from "@/lib/auth/dal";
import { getMyCvs } from "@/lib/cvs/queries";
import type { CandidateCv } from "@/lib/cvs/types";
import { rateLimit } from "@/lib/rate-limit";
import { candidateCvPath } from "@/lib/review/documents";
import { drainStorageDeletions } from "@/lib/storage/deletions";
import { documentStore } from "@/lib/storage/documents";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { postgresStore } from "@/lib/supabase/rate-limit-store";

export type UploadCvResult = { ok: true; cv: CandidateCv } | { ok: false; error: string };
export type DeleteCvResult = { ok: true } | { ok: false; error: string };

const UPLOAD_FAILURE = "Could not upload your CV. Try again.";

// A CV uploaded to the candidate's account (features/candidate-cvs.md), from the "Your CVs" page or
// the apply dialog, which selects the CV it returns. Called directly with the form's data, not
// through useActionState. The candidate never writes to a table: after the checks, the file goes to
// R2 and the row is inserted with the secret key, so the storage key always comes from here. In this
// order:
//   1. the file is a PDF by its content, up to 5 MB;
//   2. the caller is a candidate, within 20 uploads an hour;
//   3. they have fewer than 5 CVs (a friendly early answer; the database has the final say);
//   4. the file goes to R2;
//   5. the row is inserted (a 6th CV is refused by a trigger, 54000), and the file is deleted again
//      if that fails.
export async function uploadCv(formData: FormData): Promise<UploadCvResult> {
  const parsed = await cvUploadSchema.safeParseAsync(cvUploadFields(formData));
  if (!parsed.success) {
    return { ok: false, error: z.flattenError(parsed.error).fieldErrors.cv?.[0] ?? UPLOAD_FAILURE };
  }
  const { cv } = parsed.data;

  const user = await requireAccountType("candidate");

  const { success } = await rateLimit({
    key: `cv-upload:${user.id}`,
    limit: 20,
    windowMs: 60 * 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "You've uploaded a lot of CVs. Try again in an hour." };

  const { count, error: countError } = await supabaseAdmin
    .from("candidate_cvs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) {
    console.error("uploadCv count failed:", countError.code, countError.message);
    return { ok: false, error: UPLOAD_FAILURE };
  }
  if ((count ?? 0) >= MAX_CVS) return { ok: false, error: CV_LIMIT_MESSAGE };

  const id = crypto.randomUUID();
  const storageKey = candidateCvPath(user.id, id, cv.name);
  const fileName = storageKey.split("/").at(-1) ?? "cv.pdf";

  try {
    await documentStore.put(storageKey, new Uint8Array(await cv.arrayBuffer()), "application/pdf");
  } catch (error) {
    console.error("uploadCv put failed:", error);
    return { ok: false, error: UPLOAD_FAILURE };
  }

  const { data, error } = await supabaseAdmin
    .from("candidate_cvs")
    .insert({ id, user_id: user.id, file_name: fileName, storage_key: storageKey, size_bytes: cv.size })
    .select("created_at")
    .single<{ created_at: string }>();
  if (error || !data) {
    // Best effort: a file nobody will ever open is only clutter, and must not hide the answer.
    await documentStore.delete(storageKey).catch((cleanupError) => console.error("uploadCv cleanup failed:", cleanupError));
    if (error?.code === "54000") return { ok: false, error: CV_LIMIT_MESSAGE };
    console.error("uploadCv insert failed:", error?.code, error?.message);
    return { ok: false, error: UPLOAD_FAILURE };
  }

  refresh();
  return { ok: true, cv: { id, fileName, sizeBytes: cv.size, createdAt: data.created_at, activeOn: [] } };
}

// Deletes one of the caller's CVs. The database refuses while an active application uses it
// (23503): the candidate is told which jobs, and that withdrawing, or the company closing the job,
// unlocks it. The file in R2 is queued by a trigger and deleted after the response.
export async function deleteCv(cvId: string): Promise<DeleteCvResult> {
  const parsed = z.uuid().safeParse(cvId);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const user = await requireAccountType("candidate");

  const { success } = await rateLimit({
    key: `cv-delete:${user.id}`,
    limit: 30,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) return { ok: false, error: "Too many changes. Try again in a minute." };

  // By id and by owner: another candidate's id deletes nothing.
  const { data, error } = await supabaseAdmin
    .from("candidate_cvs")
    .delete()
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .select("id");
  if (error?.code === "23503") {
    const jobs = (await getMyCvs().catch(() => [])).find((cv) => cv.id === parsed.data)?.activeOn ?? [];
    const where = jobs.length > 0 ? ` for ${jobs.join(", ")}` : "";
    return {
      ok: false,
      error: `This CV is on an active application${where}. You can delete it once the company closes the job or you withdraw the application.`,
    };
  }
  if (error) {
    console.error("deleteCv failed:", error.code, error.message);
    return { ok: false, error: "Could not delete your CV. Try again." };
  }
  if (!data?.length) return { ok: false, error: CV_GONE_MESSAGE };

  after(drainStorageDeletions);
  refresh();
  return { ok: true };
}
