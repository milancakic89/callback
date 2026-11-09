// An application's documents (features/applicant-review.md). Plain module: the document route, the
// review screen and the seed script share it. The files are in a private R2 bucket
// (features/document-storage.md) and are opened through documentUrl() only.

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

// A name from the candidate's computer made safe to keep in a storage key and to show: no folders,
// no ".pdf" (it is added back), accents dropped, anything but letters, digits and ". _ -" turned
// into a space. A name with nothing left falls back to the kind ("cv.pdf").
export function cleanDocumentName(original: string, kind: DocumentKind): string {
  const base = original.split(/[\\/]/).at(-1) ?? "";
  const cleaned = base
    .replace(/\.pdf$/i, "")
    .replace(/đ/g, "dj")
    .replace(/Đ/g, "Dj")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._ -]+/g, " ")
    .replace(/\s+/g, " ")
    // Dots and hyphens at the ends would make "..", a hidden file or a dangling dash.
    .replace(/^[ .-]+|[ .-]+$/g, "")
    .slice(0, 80)
    .trim();
  return `${cleaned || kind}.pdf`;
}

// Where an application's own files go in the bucket: applications/{applicationId}/{kind}/{name}.pdf.
// fileName() in src/lib/companies/workspace.ts shows the last part, so Fast Manual Mode lists the
// real file name. (A mock candidate's, mock/<key>/<kind>.pdf, is made by mockDocumentPath().)
export function applicationDocumentPath(applicationId: string, kind: DocumentKind, originalName: string): string {
  return `applications/${applicationId}/${kind}/${cleanDocumentName(originalName, kind)}`;
}

// Where a CV on a candidate's account goes (features/candidate-cvs.md):
// candidates/{userId}/cvs/{cvId}/{name}.pdf. An application to a job keeps a copy of this key as its
// `cv_path`, so Fast Manual Mode shows the CV's real file name here too.
export function candidateCvPath(userId: string, cvId: string, originalName: string): string {
  return `candidates/${userId}/cvs/${cvId}/${cleanDocumentName(originalName, "cv")}`;
}
