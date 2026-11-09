import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/rate-limit";
import { documentStore } from "@/lib/storage/documents";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { postgresStore } from "@/lib/supabase/rate-limit-store";

// A CV on the signed-in candidate's account (features/candidate-cvs.md), opened from "Your CVs" in a
// new tab. A tab is fine here: it is the candidate's own file. Candidates have no privilege on
// candidate_cvs, so the row is read with the secret key, by its id and by its owner: another
// candidate's CV, or one that doesn't exist, is the same 404.

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
const failed = () => new Response("Could not open the CV", { status: 500, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ cvId: string }> }) {
  const parsed = z.uuid().safeParse((await params).cvId);
  if (!parsed.success) return notFound();

  const user = await getCurrentUser();
  if (!user) return new Response("Sign in", { status: 401, headers: { "Cache-Control": "no-store" } });
  if (user.accountType !== "candidate") return notFound();

  const { success, resetAt } = await rateLimit({
    key: `cv-open:${user.id}`,
    limit: 120,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    return new Response("Too many requests", { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const { data, error } = await supabaseAdmin
    .from("candidate_cvs")
    .select("storage_key, file_name")
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .maybeSingle<{ storage_key: string; file_name: string }>();
  if (error) {
    console.error("cv route: reading the row failed:", error.code, error.message);
    return failed();
  }
  if (!data) return notFound();

  let body: ReadableStream<Uint8Array> | null;
  try {
    body = await documentStore.get(data.storage_key);
  } catch (storageError) {
    console.error("cv route: reading from R2 failed:", storageError);
    return failed();
  }
  if (!body) return notFound();

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      // The name is cleaned on upload (letters, digits, spaces and ". _ -"), so it can't break the quotes.
      "Content-Disposition": `inline; filename="${data.file_name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
