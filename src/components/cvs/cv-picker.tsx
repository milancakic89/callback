"use client";

import { FileTextIcon } from "lucide-react";
import Link from "next/link";
import { CvUploadButton } from "@/components/cvs/cv-upload-button";
import { MAX_CVS } from "@/lib/applications/apply-schema";
import { formatFileSize, type CandidateCv } from "@/lib/cvs/types";
import { formatAbsolute } from "@/lib/jobs/format";
import { cn } from "cn";

// Explicit so the day doesn't depend on whether the server or the browser formats it.
const TIME_ZONE = "Europe/Belgrade";

const OPTION_CLASS = cn(
  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50",
  "has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:outline-2 has-focus-visible:outline-ring",
);

// Which of the candidate's CVs to use (features/candidate-cvs.md): the CVs on their account as radio
// buttons, and an upload that adds one to the account and selects it. Used by the apply dialog, where a
// CV is needed, and by the page that adds a job from another site (features/chrome-extension.md), where
// it is optional: `allowNone` adds a "No CV" choice, whose value is null. The choice lives in the
// caller: `value` is the chosen CV's id, `onUploaded` hands over the CV that was just uploaded, and
// `onError` gets the upload's message (null clears it).
export function CvPicker({
  cvs,
  value,
  onChange,
  allowNone = false,
  onUploaded,
  onError,
}: {
  cvs: CandidateCv[];
  value: string | null;
  onChange: (cvId: string | null) => void;
  allowNone?: boolean;
  onUploaded: (cv: CandidateCv) => void;
  onError: (message: string | null) => void;
}) {
  if (cvs.length === 0 && !allowNone) {
    return (
      <div className="grid justify-items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center">
        <FileTextIcon aria-hidden className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Upload your CV as a PDF, up to 5 MB. It is saved to your account, so you can use it again.
        </p>
        <CvUploadButton label="Upload your CV" variant="default" onUploaded={onUploaded} onError={onError} />
      </div>
    );
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">Your CVs</legend>
      {allowNone && (
        <label className={OPTION_CLASS}>
          <input
            type="radio"
            name="cv"
            value=""
            checked={value === null}
            onChange={() => onChange(null)}
            className="size-4 shrink-0 accent-primary"
          />
          <span className="font-medium">No CV</span>
        </label>
      )}
      {cvs.map((cv) => (
        <label key={cv.id} className={OPTION_CLASS}>
          <input
            type="radio"
            name="cv"
            value={cv.id}
            checked={value === cv.id}
            onChange={() => onChange(cv.id)}
            className="size-4 shrink-0 accent-primary"
          />
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate font-medium">{cv.fileName}</span>
            <span className="text-xs text-muted-foreground">
              {formatFileSize(cv.sizeBytes)} · Uploaded {formatAbsolute(cv.createdAt, TIME_ZONE)}
            </span>
          </span>
        </label>
      ))}
      {cvs.length < MAX_CVS ? (
        <CvUploadButton label="Upload a new CV" className="justify-self-start" onUploaded={onUploaded} onError={onError} />
      ) : (
        <p className="text-xs text-muted-foreground">
          You have {MAX_CVS} CVs.{" "}
          <Link href="/profile" className="font-medium text-foreground underline-offset-4 hover:underline">
            Manage your CVs
          </Link>{" "}
          to upload another.
        </p>
      )}
    </fieldset>
  );
}
