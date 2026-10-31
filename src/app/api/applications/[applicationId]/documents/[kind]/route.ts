import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/rate-limit";
import { DOCUMENTS_BUCKET, isDocumentKind } from "@/lib/review/documents";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

// An application's CV or cover letter, for the review screen's viewer (features/applicant-review.md).
// The only way to a document: the bucket has no client access, and every request is checked here.
//
// 1. The caller is a signed-in employer.
// 2. The application is found with the caller's own client, so row level security decides whose it
//    is: another company's application, or one that doesn't exist, is simply not there. A withdrawn
//    application is never opened. (Rejected applications and closed jobs will be refused here too.)
// 3. Only then is the file read, with the secret key.
//
// A browser navigation (the URL opened in a tab, or put in an iframe) is refused, so the browser's
// own PDF viewer, with its download button, never shows a candidate's file. That discourages saving
// it; it can't stop someone who uses the developer tools. Every refusal past the sign-in check is the
// same 404, so the route says nothing about which applications exist.

const paramsSchema = z.object({ applicationId: z.uuid(), kind: z.string() });

const COLUMNS = { cv: "cv_path", "cover-letter": "cover_letter_path" } as const;

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string; kind: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success || !isDocumentKind(parsed.data.kind)) return notFound();
  const { applicationId, kind } = parsed.data;

  // fetch() sends `empty`; a tab, an iframe, an <object> or <embed> send something else. A client
  // that sends no Fetch Metadata at all isn't a browser, so there is no viewer to keep it from.
  const dest = request.headers.get("sec-fetch-dest");
  if (dest !== null && dest !== "empty") return notFound();

  const user = await getCurrentUser();
  if (!user) return new Response("Sign in", { status: 401, headers: { "Cache-Control": "no-store" } });
  if (user.accountType !== "employer") return notFound();

  const { success, resetAt } = await rateLimit({
    key: `review-doc:${user.id}`,
    limit: 240,
    windowMs: 60_000,
    store: postgresStore,
  });
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    return new Response("Too many requests", { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const column = COLUMNS[kind];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_applications")
    .select(column)
    .eq("id", applicationId)
    .is("withdrawn_at", null)
    .maybeSingle<Record<typeof column, string | null>>();
  if (error) return new Response("Could not open the document", { status: 500 });
  const path = data?.[column];
  if (!path) return notFound();

  const file = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).download(path);
  if (file.error) return notFound();

  return new Response(file.data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
