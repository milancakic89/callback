"use client";

import { CircleCheckIcon, FileTextIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { applyToJob, type ApplyFormState } from "@/app/jobs/[jobId]/actions";
import { FieldError } from "@/components/auth/form-feedback";
import { MyApplicationPanel } from "@/components/applications/my-application-panel";
import { CvUploadButton } from "@/components/cvs/cv-upload-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clientPdfError, COVER_LETTER_MAX_LENGTH, MAX_CVS } from "@/lib/applications/apply-schema";
import { formatFileSize, type CallbackApplication, type CandidateCv } from "@/lib/cvs/types";
import { formatAbsolute } from "@/lib/jobs/format";
import { cn } from "cn";

const INITIAL_STATE: ApplyFormState = {};

// Explicit so the day doesn't depend on whether the server or the browser formats it.
const TIME_ZONE = "Europe/Belgrade";

type LetterMode = "none" | "text" | "pdf";

const LETTER_MODES: { value: LetterMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "text", label: "Write" },
  { value: "pdf", label: "Upload PDF" },
];

export function AppliedNotice({ appliedAt }: { appliedAt: string }) {
  return (
    <div className="flex items-start gap-3">
      <CircleCheckIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-600" />
      <div className="grid gap-1">
        <p className="font-medium">You applied on {formatAbsolute(appliedAt, TIME_ZONE)}</p>
        <p className="text-sm text-muted-foreground">
          The company can read your application now. Follow it on{" "}
          <Link href="/applications" className="font-medium text-foreground underline-offset-4 hover:underline">
            Applications
          </Link>
          , and withdraw it from this page.
        </p>
      </div>
    </div>
  );
}

// Applying on a posting (features/candidate-cvs.md), in a dialog with two steps: choose a CV from the
// account (or upload one to the account, which selects it), then the name, the location and an
// optional cover letter, typed or as a PDF. `?apply=1` opens it by itself: that is where "Sign in to
// apply" and "Create an account" come back to.
//
// Once the candidate has applied, the panel shows their application (features/callback-applications-in-table.md):
// its status, the CV and cover letter, and Withdraw. It stays mounted after the application is sent (the
// page refreshes with `appliedAt` and the application set), so the dialog can say so before it closes.
// Everything the candidate typed or chose is kept in state, and the form submits by hand: React resets
// a form's uncontrolled fields after an action, which would throw away a chosen cover letter after a
// failed send.
export function ApplyDialog({
  jobId,
  jobTitle,
  companyName,
  cvs,
  initialName,
  initialLocation,
  application,
}: {
  jobId: string;
  jobTitle: string;
  companyName: string;
  cvs: CandidateCv[];
  initialName: string;
  initialLocation: string;
  // The candidate's application to this job, once they have applied.
  application: CallbackApplication | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const askedToApply = searchParams.get("apply") === "1";
  const appliedAt = application?.appliedAt ?? null;

  const [state, formAction, sending] = useActionState(applyToJob, INITIAL_STATE);
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(askedToApply && !appliedAt);
  const [step, setStep] = useState<"cv" | "details">("cv");
  // CVs uploaded here, until the refreshed page lists them too.
  const [uploaded, setUploaded] = useState<CandidateCv[]>([]);
  const [cvId, setCvId] = useState<string | null>(cvs[0]?.id ?? null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation);
  const [letterMode, setLetterMode] = useState<LetterMode>("none");
  const [letterText, setLetterText] = useState("");
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [letterFileError, setLetterFileError] = useState<string | null>(null);

  const sentAt = appliedAt ?? state.appliedAt ?? null;
  const allCvs = [...uploaded.filter((cv) => !cvs.some((listed) => listed.id === cv.id)), ...cvs];
  const selected = allCvs.find((cv) => cv.id === cvId) ?? null;

  function onOpenChange(next: boolean) {
    if (sending) return;
    setOpen(next);
    // Closing drops `?apply=1`, so a reload doesn't open it again.
    if (!next && askedToApply) router.replace(pathname, { scroll: false });
  }

  function onUploaded(cv: CandidateCv) {
    setUploaded((current) => [cv, ...current]);
    setCvId(cv.id);
    setUploadError(null);
  }

  function onLetterFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const message = clientPdfError(file);
    setLetterFileError(message);
    setLetterFile(message ? null : file);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      setStep("cv");
      return;
    }
    const data = new FormData();
    data.set("jobId", jobId);
    data.set("cvId", selected.id);
    data.set("fullName", name);
    data.set("location", location);
    if (letterMode === "text") data.set("coverLetterText", letterText);
    if (letterMode === "pdf" && letterFile) data.set("coverLetter", letterFile);
    startTransition(() => formAction(data));
  }

  const letterErrors = letterFileError ? [letterFileError] : state.fieldErrors?.coverLetter;

  return (
    <>
      {sentAt ? (
        application ? (
          <MyApplicationPanel application={application} />
        ) : (
          <AppliedNotice appliedAt={sentAt} />
        )
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Apply with a CV from your account. You can add a cover letter too.
          </p>
          <Button type="button" size="lg" className="w-full" onClick={() => onOpenChange(true)}>
            Apply
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          {sentAt ? (
            <>
              <DialogHeader>
                <DialogTitle>Application sent</DialogTitle>
                <DialogDescription>
                  {companyName} can read your application for {jobTitle} now.
                </DialogDescription>
              </DialogHeader>
              <AppliedNotice appliedAt={sentAt} />
              <DialogFooter>
                <Button type="button" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : step === "cv" ? (
            <>
              <DialogHeader>
                <DialogTitle>Choose a CV</DialogTitle>
                <DialogDescription>
                  for {jobTitle} at {companyName}
                </DialogDescription>
              </DialogHeader>

              {uploadError && (
                <Alert variant="destructive">
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}

              {allCvs.length === 0 ? (
                <div className="grid justify-items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center">
                  <FileTextIcon aria-hidden className="size-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Upload your CV as a PDF, up to 5 MB. It is saved to your account, so you can use it again.
                  </p>
                  <CvUploadButton label="Upload your CV" variant="default" onUploaded={onUploaded} onError={setUploadError} />
                </div>
              ) : (
                <fieldset className="grid gap-2">
                  <legend className="sr-only">Your CVs</legend>
                  {allCvs.map((cv) => (
                    <label
                      key={cv.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50",
                        "has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:outline-2 has-focus-visible:outline-ring",
                      )}
                    >
                      <input
                        type="radio"
                        name="cv"
                        value={cv.id}
                        checked={cvId === cv.id}
                        onChange={() => setCvId(cv.id)}
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
                  {allCvs.length < MAX_CVS ? (
                    <CvUploadButton label="Upload a new CV" className="justify-self-start" onUploaded={onUploaded} onError={setUploadError} />
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
              )}

              <p className="text-xs text-muted-foreground">
                The CV stays on your account. The company can read it for as long as your application is active.
              </p>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="button" disabled={!selected} onClick={() => setStep("details")}>
                  Next
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={onSubmit} className="grid gap-4">
              <DialogHeader>
                <DialogTitle>Your details</DialogTitle>
                <DialogDescription>
                  for {jobTitle} at {companyName}
                </DialogDescription>
              </DialogHeader>

              {state.error && (
                <Alert variant="destructive">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                <FileTextIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-xs text-muted-foreground">CV</span>
                  <span className="truncate font-medium">{selected?.fileName}</span>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep("cv")}>
                  Change
                </Button>
              </div>
              <FieldError id="cvId-error" errors={state.fieldErrors?.cvId} />

              <div className="grid gap-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={100}
                  aria-invalid={Boolean(state.fieldErrors?.fullName)}
                  aria-describedby="fullName-error"
                  required
                />
                <FieldError id="fullName-error" errors={state.fieldErrors?.fullName} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="location">
                  Location <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  autoComplete="address-level2"
                  placeholder="Belgrade, Serbia"
                  maxLength={100}
                  aria-invalid={Boolean(state.fieldErrors?.location)}
                  aria-describedby="location-error"
                />
                <FieldError id="location-error" errors={state.fieldErrors?.location} />
              </div>

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">
                  Cover letter <span className="font-normal text-muted-foreground">(optional)</span>
                </legend>
                <div className="inline-flex w-fit rounded-lg border p-0.5">
                  {LETTER_MODES.map((mode) => (
                    <label
                      key={mode.value}
                      className={cn(
                        "cursor-pointer rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors",
                        "has-checked:bg-muted has-checked:font-medium has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring",
                      )}
                    >
                      <input
                        type="radio"
                        name="letterMode"
                        value={mode.value}
                        checked={letterMode === mode.value}
                        onChange={() => setLetterMode(mode.value)}
                        className="sr-only"
                      />
                      {mode.label}
                    </label>
                  ))}
                </div>

                {letterMode === "text" && (
                  <div className="grid gap-1">
                    <Textarea
                      aria-label="Your cover letter"
                      value={letterText}
                      onChange={(event) => setLetterText(event.target.value)}
                      maxLength={COVER_LETTER_MAX_LENGTH}
                      rows={7}
                      className="max-h-72"
                      aria-invalid={Boolean(state.fieldErrors?.coverLetterText)}
                      aria-describedby="coverLetterText-error"
                    />
                    <p className="justify-self-end text-xs text-muted-foreground tabular-nums">
                      {letterText.length.toLocaleString("en-GB")} / {COVER_LETTER_MAX_LENGTH.toLocaleString("en-GB")}
                    </p>
                    <FieldError id="coverLetterText-error" errors={state.fieldErrors?.coverLetterText} />
                  </div>
                )}

                {letterMode === "pdf" && (
                  <div className="grid gap-2">
                    {letterFile ? (
                      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                        <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{letterFile.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove the cover letter"
                          onClick={() => setLetterFile(null)}
                        >
                          <XIcon aria-hidden />
                        </Button>
                      </div>
                    ) : (
                      <Input
                        type="file"
                        accept="application/pdf,.pdf"
                        aria-label="Cover letter (PDF, up to 5 MB)"
                        onChange={(event) => onLetterFile(event.currentTarget)}
                        aria-invalid={Boolean(letterErrors)}
                        aria-describedby="coverLetter-error"
                      />
                    )}
                    <FieldError id="coverLetter-error" errors={letterErrors} />
                  </div>
                )}
              </fieldset>

              <DialogFooter>
                <Button type="button" variant="outline" disabled={sending} onClick={() => setStep("cv")}>
                  Back
                </Button>
                <Button type="submit" disabled={sending}>
                  {sending ? "Sending…" : "Send application"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
