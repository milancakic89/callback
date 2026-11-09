import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { documentStore } from "./documents";

// How many queued files one drain deletes. A withdrawal or a deleted job queues a few files per
// application, so this clears a large job in one go and a backlog over a few.
const BATCH = 100;

// Deletes the files the database has let go of (features/candidate-cvs.md). SQL can't call R2, so
// triggers on job_applications and candidate_cvs queue the keys in public.storage_deletions
// (supabase/migrations/20261109150000_candidate_cvs.sql), and this deletes them from R2 and then
// from the queue. A key R2 couldn't delete stays queued, and the next drain tries it again. Meant to
// run after the response (`after()` in every action that withdraws or deletes), so nobody waits for
// it; it logs and never throws.
export async function drainStorageDeletions(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("storage_deletions")
    .select("key")
    .order("queued_at", { ascending: true })
    .limit(BATCH)
    .returns<{ key: string }[]>();
  if (error) {
    console.error("drainStorageDeletions read failed:", error.code, error.message);
    return;
  }

  const deleted: string[] = [];
  for (const { key } of data ?? []) {
    try {
      await documentStore.delete(key);
      deleted.push(key);
    } catch (storageError) {
      console.error("drainStorageDeletions delete failed:", key, storageError);
    }
  }
  if (deleted.length === 0) return;

  const { error: removeError } = await supabaseAdmin.from("storage_deletions").delete().in("key", deleted);
  // The files are gone; the rows are deleted again (a no-op in R2) on the next drain.
  if (removeError) console.error("drainStorageDeletions dequeue failed:", removeError.code, removeError.message);
}
