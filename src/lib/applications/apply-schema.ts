import { z } from "zod";

// The documents a candidate uploads (features/candidate-cvs.md): a CV to their account, and a cover
// letter to an application. PDF only, up to 5 MB each.
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_CVS = 5;
export const COVER_LETTER_MAX_LENGTH = 5000;

export const EMPTY_FILE_MESSAGE = "That file is empty.";
export const TOO_BIG_MESSAGE = "That file is larger than 5 MB.";
export const NOT_PDF_MESSAGE = "Only PDF files are accepted.";
export const BOTH_COVER_LETTERS_MESSAGE = "Send a written cover letter or a PDF, not both.";
export const CV_LIMIT_MESSAGE = `You can keep up to ${MAX_CVS} CVs. Delete one to add another.`;
export const CV_GONE_MESSAGE = "That CV is no longer on your account.";

const PDF_MAGIC = "%PDF-";

// Whether the bytes start like a PDF. The type the browser sends, and the file's name, are what the
// candidate's computer says; only the content tells.
export async function startsLikePdf(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, PDF_MAGIC.length).arrayBuffer());
  return head.length === PDF_MAGIC.length && PDF_MAGIC.split("").every((char, index) => head[index] === char.charCodeAt(0));
}

// The check the browser can do before it uploads anything; the action checks the content again.
export function clientPdfError(file: File | undefined): string | null {
  if (!file) return null;
  if (file.size === 0) return EMPTY_FILE_MESSAGE;
  if (file.size > MAX_DOCUMENT_BYTES) return TOO_BIG_MESSAGE;
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return NOT_PDF_MESSAGE;
  return null;
}

// A PDF from the candidate's computer: not empty, at most 5 MB, and a PDF by its content. Async: it
// reads the first bytes.
export function pdfFileSchema(missing: string) {
  return z
    .instanceof(File, { error: missing })
    .refine((file) => file.size > 0, EMPTY_FILE_MESSAGE)
    .refine((file) => file.size <= MAX_DOCUMENT_BYTES, TOO_BIG_MESSAGE)
    .refine(async (file) => file.size === 0 || (await startsLikePdf(file)), NOT_PDF_MESSAGE);
}

// What the apply dialog submits. The CV is one already on the candidate's account, by id; the cover
// letter is optional, and is either typed or a PDF, never both.
export const applySchema = z
  .object({
    jobId: z.uuid(),
    cvId: z.uuid({ error: "Choose a CV." }),
    fullName: z.string().trim().min(1, "Enter your full name.").max(100, "Use at most 100 characters."),
    // Optional; an empty box is no location.
    location: z
      .string()
      .trim()
      .max(100, "Use at most 100 characters.")
      .transform((value) => value || null),
    // Optional; an empty box is no letter.
    coverLetterText: z
      .string()
      .trim()
      .max(COVER_LETTER_MAX_LENGTH, "Use at most 5,000 characters.")
      .transform((value) => value || null),
    // Optional: a form with no file chosen is the same as no field at all (see applyFields()).
    coverLetter: pdfFileSchema("Choose your cover letter as a PDF.").optional(),
  })
  .refine((value) => !(value.coverLetterText && value.coverLetter), {
    message: BOTH_COVER_LETTERS_MESSAGE,
    path: ["coverLetter"],
  });

// A CV uploaded to the account, from the "Your CVs" page or the apply dialog.
export const cvUploadSchema = z.object({ cv: pdfFileSchema("Choose your CV as a PDF.") });

function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// A file input nobody chose a file for still submits an empty, nameless file. It is read as "nothing
// chosen": a missing CV, and an absent cover letter.
function fileField(formData: FormData, name: string): File | undefined {
  const value = formData.get(name);
  return value instanceof File && !(value.size === 0 && value.name === "") ? value : undefined;
}

export function applyFields(formData: FormData) {
  return {
    jobId: textField(formData, "jobId"),
    cvId: textField(formData, "cvId"),
    fullName: textField(formData, "fullName"),
    location: textField(formData, "location"),
    coverLetterText: textField(formData, "coverLetterText"),
    coverLetter: fileField(formData, "coverLetter"),
  };
}

export function cvUploadFields(formData: FormData) {
  return { cv: fileField(formData, "cv") };
}
