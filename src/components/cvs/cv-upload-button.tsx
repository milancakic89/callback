"use client";

import { UploadIcon } from "lucide-react";
import { useRef, useTransition } from "react";
import { uploadCv } from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/button";
import { clientPdfError } from "@/lib/applications/apply-schema";
import type { CandidateCv } from "@/lib/cvs/types";

// "Upload a CV" (features/candidate-cvs.md): a button that opens the file picker and sends the chosen
// PDF to the account at once. Used on the "Your CVs" page and in the apply dialog, which selects the
// new CV. The browser refuses a file over 5 MB or not a PDF before uploading it; the action checks the
// content again. `onError(null)` clears an earlier message when the picker opens.
export function CvUploadButton({
  label = "Upload a CV",
  variant = "outline",
  className,
  onUploaded,
  onError,
}: {
  label?: string;
  variant?: "default" | "outline";
  className?: string;
  onUploaded: (cv: CandidateCv) => void;
  onError: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // So choosing the same file again (after a failure) is still a change.
    event.currentTarget.value = "";
    if (!file) return;
    const message = clientPdfError(file);
    if (message) {
      onError(message);
      return;
    }
    const data = new FormData();
    data.set("cv", file);
    startTransition(async () => {
      const result = await uploadCv(data);
      if (result.ok) onUploaded(result.cv);
      else onError(result.error);
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onChange}
      />
      <Button
        type="button"
        variant={variant}
        className={className}
        disabled={pending}
        onClick={() => {
          onError(null);
          inputRef.current?.click();
        }}
      >
        <UploadIcon aria-hidden /> {pending ? "Uploading…" : label}
      </Button>
    </>
  );
}
