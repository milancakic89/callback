// An application's documents (features/applicant-review.md). Plain module: the document route, the
// review screen and the seed script share it.

// Private: no client role can read it. Files are opened through documentUrl() only.
export const DOCUMENTS_BUCKET = "application-documents";

export const DOCUMENT_KINDS = ["cv", "cover-letter"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export function isDocumentKind(value: string): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value);
}

// The route that checks access on every request and answers the PDF
// (src/app/api/applications/[applicationId]/documents/[kind]/route.ts).
export function documentUrl(applicationId: string, kind: DocumentKind): string {
  return `/api/applications/${applicationId}/documents/${kind}`;
}

// Where the seed script puts a mock candidate's documents. The paths are repeated in
// public.demo_applicants() (supabase/migrations/20261031120000_applicant_review.sql).
export function mockDocumentPath(sampleKey: string, kind: DocumentKind): string {
  return `mock/${sampleKey}/${kind}.pdf`;
}

// The committed PDFs the seed script uploads there, relative to the repository root. Printed from the
// landing's sample documents by `npm run demo:documents`.
export function demoDocumentFile(sampleKey: string, kind: DocumentKind): string {
  return `supabase/seed/documents/${sampleKey}-${kind}.pdf`;
}
