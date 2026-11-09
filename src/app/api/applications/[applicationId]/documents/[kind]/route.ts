import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/rate-limit";
import { isDocumentKind } from "@/lib/review/documents";
import { documentStore } from "@/lib/storage/documents";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

// An application's CV or cover letter (features/applicant-review.md, features/candidate-cvs.md). The
// only way to a document: the R2 bucket is private (features/document-storage.md), and every request
// is checked here. Two callers:
//
// The employer, for the review screen's viewer.
//   1. The application is found with the caller's own client, so row level security decides whose it
//      is: another company's application, or one that doesn't exist, is simply not there. A withdrawn
//      application is never opened (it holds no documents anyway).
//   2. A browser navigation (the URL opened in a tab, or put in an iframe) is refused, so the
//      browser's own PDF viewer, with its download button, never shows a candidate's file. That
//      discourages saving it; it can't stop someone who uses the developer tools.
//
// The candidate, for their own application on /applications. my_application_document_path() answers
// only about the caller's own active application. A tab is fine: it is their own file.
//
// Only then is the file read from R2, with the server's own key, and streamed on. Every refusal past
// the sign-in check is the same 404, so the route says nothing about which applications exist.

const paramsSchema = z.object({ applicationId: z.uuid(), kind: z.string() });

const COLUMNS = { cv: "cv_path", "cover-letter": "cover_letter_path" } as const;

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
const failed = () => new Response("Could not open the document", { status: 500, headers: { "Cache-Control": "no-store" } });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string; kind: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success || !isDocumentKind(parsed.data.kind)) return notFound();
  const { applicationId, kind } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return new Response("Sign in", { status: 401, headers: { "Cache-Control": "no-store" } });

  // fetch() sends `empty`; a tab, an iframe, an <object> or <embed> send something else. A client
  // that sends no Fetch Metadata at all isn't a browser, so there is no viewer to keep it from.
  const dest = request.headers.get("sec-fetch-dest");
  if (user.accountType === "employer" && dest !== null && dest !== "empty") return notFound();

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

  const supabase = await createClient();
  let path: string | null | undefined;
  if (user.accountType === "candidate") {
    const { data, error } = await supabase.rpc("my_application_document_path", {
      p_application_id: applicationId,
      p_kind: kind,
    });
    if (error) return failed();
    path = typeof data === "string" ? data : null;
  } else {
    const column = COLUMNS[kind];
    const { data, error } = await supabase
      .from("job_applications")
      .select(column)
      .eq("id", applicationId)
      .is("withdrawn_at", null)
      .maybeSingle<Record<typeof column, string | null>>();
    if (error) return failed();
    path = data?.[column];
  }
  if (!path) return notFound();

  let body: ReadableStream<Uint8Array> | null;
  try {
    body = await documentStore.get(path);
  } catch (storageError) {
    console.error("document route: reading from R2 failed:", storageError);
    return failed();
  }
  if (!body) return notFound();

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
