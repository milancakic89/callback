"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { addExternalApplication, type AddExternalApplicationState } from "@/app/(app)/applications/actions";
import { StatusSelect } from "@/components/applications/status-select";
import { FieldError } from "@/components/auth/form-feedback";
import { CvPicker } from "@/components/cvs/cv-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApplicationStatus } from "@/lib/applications/types";
import type { CandidateCv } from "@/lib/cvs/types";
import { EXTERNAL_SOURCE_LABELS } from "@/lib/external-jobs/sources";
import { COMPANY_MAX, LOCATION_MAX, TITLE_MAX } from "@/lib/external-jobs/track-link";
import type { TrackQuery } from "@/lib/external-jobs/track-query";

const INITIAL_STATE: AddExternalApplicationState = {};

// "Add an application" (features/chrome-extension.md): where the browser extension's button leads. The
// job's title, company and place are what the extension read off the page, prefilled for the candidate
// to check; the address, which decides the source, is shown and sent but can't be edited. Nothing is
// saved until Save: opening the page writes nothing. With exactly one CV on the account it is
// preselected, and "No CV" is a choice. Everything typed or chosen is kept in state, and the form
// submits by hand, as the apply dialog does: React resets a form's uncontrolled fields after an action,
// which would throw away what the candidate typed after a failed save.
export function AddExternalApplicationForm({ job, cvs }: { job: TrackQuery; cvs: CandidateCv[] }) {
  const [state, formAction, saving] = useActionState(addExternalApplication, INITIAL_STATE);
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState(job.title ?? "");
  const [company, setCompany] = useState(job.company ?? "");
  const [location, setLocation] = useState(job.location ?? "");
  const [status, setStatus] = useState<ApplicationStatus>("PENDING");
  // CVs uploaded here, until the refreshed page lists them too.
  const [uploaded, setUploaded] = useState<CandidateCv[]>([]);
  const [cvId, setCvId] = useState<string | null>(cvs.length === 1 ? cvs[0].id : null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const allCvs = [...uploaded.filter((cv) => !cvs.some((listed) => listed.id === cv.id)), ...cvs];
  const sourceLabel = EXTERNAL_SOURCE_LABELS[job.source];

  function onUploaded(cv: CandidateCv) {
    setUploaded((current) => [cv, ...current]);
    setCvId(cv.id);
    setUploadError(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("url", job.url);
    data.set("title", title);
    data.set("company", company);
    data.set("location", location);
    data.set("cvId", cvId ?? "");
    data.set("status", status);
    startTransition(() => formAction(data));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Add an application</CardTitle>
        <CardDescription>
          Check what we read from the page, choose the CV you used and its status, then save. It joins the jobs on your
          applications list.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-5">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-1 rounded-lg border px-3 py-2.5">
            <span className="text-xs text-muted-foreground">Job on {sourceLabel}</span>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 items-center gap-1.5 text-sm font-medium hover:underline"
            >
              <span className="truncate">{job.url}</span>
              <ExternalLinkIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            </a>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="title">Job title</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={TITLE_MAX}
              aria-invalid={Boolean(state.fieldErrors?.title)}
              aria-describedby="title-error"
              required
            />
            <FieldError id="title-error" errors={state.fieldErrors?.title} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              maxLength={COMPANY_MAX}
              aria-invalid={Boolean(state.fieldErrors?.company)}
              aria-describedby="company-error"
              required
            />
            <FieldError id="company-error" errors={state.fieldErrors?.company} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="location">
              Location <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={LOCATION_MAX}
              placeholder="Belgrade, Serbia"
              aria-invalid={Boolean(state.fieldErrors?.location)}
              aria-describedby="location-error"
            />
            <FieldError id="location-error" errors={state.fieldErrors?.location} />
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-medium">
              CV <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            {uploadError && (
              <Alert variant="destructive">
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}
            <CvPicker cvs={allCvs} value={cvId} onChange={setCvId} allowNone onUploaded={onUploaded} onError={setUploadError} />
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-medium">Status</p>
            <StatusSelect jobTitle={title || job.title || "this job"} value={status} onChange={setStatus} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" size="lg" nativeButton={false} render={<Link href="/applications" />}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
