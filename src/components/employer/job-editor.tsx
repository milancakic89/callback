"use client";

import { UploadIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { createJobPosting, updateJobPosting, type JobFormState } from "@/app/(employer)/[company]/actions";
import { FieldError, FormAlert } from "@/components/auth/form-feedback";
import { ChipsInput } from "@/components/jobs/chips-input";
import { WorkModeBadge } from "@/components/jobs/work-mode-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DESCRIPTION_MAX, FILTER_MAX, FILTERS_MAX, LOCATION_MAX, TITLE_MAX } from "@/lib/companies/job-posting";
import { WORK_MODE_LABELS, WORK_MODES, type WorkMode } from "@/lib/jobs/types";

// Stands for "no work mode" in the select; the form submits it as an empty value.
const NO_WORK_MODE = "none";
type WorkModeChoice = WorkMode | typeof NO_WORK_MODE;

function isWorkModeChoice(value: unknown): value is WorkModeChoice {
  return value === NO_WORK_MODE || WORK_MODES.some((mode) => mode === value);
}

const initialState: JobFormState = {};

// A job being edited: what the form starts with (src/lib/companies/workspace.ts, getCompanyJob).
export type EditableJob = {
  id: string;
  title: string;
  description: string;
  location: string;
  workMode: WorkMode | null;
  requiredFilters: string[];
  optionalFilters: string[];
};

// The job form (features/companies.md, features/post-job.md, features/job-publishing.md): the fields
// on the left, and on the right the posting as a candidate will see it. Without `job` it creates one:
// the Server Action createJobPosting stores it as a draft. With `job` it edits that job through
// updateJobPosting, which sends the id as a hidden input. Either way the employer lands back on the
// dashboard. The Upload CV button belongs to the candidate's view, so it does nothing here: uploading
// comes later.
//
// The values live in state, not only in the inputs: the preview reads them, and React resets an
// uncontrolled form after every action, which would wipe it when the server refuses a field (the
// same reason as src/components/auth/use-auth-form.ts).
//
// The CV filters (features/job-filters.md) are chips; each chip is submitted as its own hidden input.
// They are private to the company, so the preview doesn't show them.
export function JobEditor({
  companyName,
  companySlug,
  job,
}: {
  companyName: string;
  companySlug: string;
  job?: EditableJob;
}) {
  const [state, formAction, pending] = useActionState(job ? updateJobPosting : createJobPosting, initialState);
  const [title, setTitle] = useState(job?.title ?? "");
  const [description, setDescription] = useState(job?.description ?? "");
  const [location, setLocation] = useState(job?.location ?? "");
  const [workMode, setWorkMode] = useState<WorkModeChoice>(job?.workMode ?? NO_WORK_MODE);
  const [requiredFilters, setRequiredFilters] = useState<string[]>(job?.requiredFilters ?? []);
  const [optionalFilters, setOptionalFilters] = useState<string[]>(job?.optionalFilters ?? []);

  const errors = state.fieldErrors;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form action={formAction} className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
        <FormAlert state={state} />
        {job && <input type="hidden" name="jobId" value={job.id} />}
        <div className="grid gap-2">
          <Label htmlFor="job-title">Title</Label>
          <Input
            id="job-title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={TITLE_MAX}
            placeholder="Senior React Developer"
            aria-invalid={Boolean(errors?.title)}
            aria-describedby="job-title-error"
            required
          />
          <FieldError id="job-title-error" errors={errors?.title} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="job-description">Description</Label>
          <Textarea
            id="job-description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={12}
            placeholder="What the role involves, what you are looking for, what you offer."
            aria-invalid={Boolean(errors?.description)}
            aria-describedby="job-description-error"
            required
          />
          <FieldError id="job-description-error" errors={errors?.description} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="job-location">
              Location <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="job-location"
              name="location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={LOCATION_MAX}
              placeholder="Belgrade, Serbia"
              autoComplete="off"
              aria-invalid={Boolean(errors?.location)}
              aria-describedby="job-location-error"
            />
            <FieldError id="job-location-error" errors={errors?.location} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="job-work-mode">
              Work mode <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            {/* The select has no `name`: this input is what the form submits. */}
            <input type="hidden" name="workMode" value={workMode === NO_WORK_MODE ? "" : workMode} />
            <Select
              value={workMode}
              onValueChange={(value) => {
                if (isWorkModeChoice(value)) setWorkMode(value);
              }}
            >
              <SelectTrigger
                id="job-work-mode"
                className="w-full"
                aria-invalid={Boolean(errors?.workMode)}
                aria-describedby="job-work-mode-error"
              >
                {/* Base UI shows the raw value unless told how to render it. */}
                <SelectValue>
                  {(value: string) => (isWorkModeChoice(value) && value !== NO_WORK_MODE ? WORK_MODE_LABELS[value] : "Not specified")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value={NO_WORK_MODE}>Not specified</SelectItem>
                {WORK_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {WORK_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id="job-work-mode-error" errors={errors?.workMode} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="job-required-filters">
            Required filters <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          {requiredFilters.map((filter) => (
            <input key={filter} type="hidden" name="requiredFilters" value={filter} />
          ))}
          <ChipsInput
            id="job-required-filters"
            values={requiredFilters}
            onChange={setRequiredFilters}
            maxLength={FILTER_MAX}
            maxValues={FILTERS_MAX - optionalFilters.length}
            placeholder="Type a filter, press Enter"
            aria-invalid={Boolean(errors?.requiredFilters)}
            aria-describedby="job-required-filters-error"
          />
          <FieldError id="job-required-filters-error" errors={errors?.requiredFilters} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="job-optional-filters">
            Nice-to-have filters <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          {optionalFilters.map((filter) => (
            <input key={filter} type="hidden" name="optionalFilters" value={filter} />
          ))}
          <ChipsInput
            id="job-optional-filters"
            values={optionalFilters}
            onChange={setOptionalFilters}
            maxLength={FILTER_MAX}
            maxValues={FILTERS_MAX - requiredFilters.length}
            placeholder="Type a filter, press Enter"
            aria-invalid={Boolean(errors?.optionalFilters)}
            aria-describedby="job-optional-filters-error"
          />
          <FieldError id="job-optional-filters-error" errors={errors?.optionalFilters} />
          <p className="text-xs text-muted-foreground">
            Candidates don&apos;t see these. Their CVs will be checked against them. Up to {FILTERS_MAX} in all.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Saving…" : job ? "Save changes" : "Save job"}
          </Button>
          <Link href={`/${companySlug}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Cancel
          </Link>
        </div>
        {!job && (
          <p className="text-xs text-muted-foreground">Saved as a draft. Publish it from the dashboard.</p>
        )}
      </form>

      <Card aria-label="Candidate preview">
        <CardHeader className="border-b">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Candidate preview
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1">
            <CardTitle className={title.trim() ? "text-xl" : "text-xl text-muted-foreground"}>
              {title.trim() || "Job title"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{companyName}</p>
            {(location.trim() || workMode !== NO_WORK_MODE) && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {location.trim() && <span className="wrap-anywhere">{location.trim()}</span>}
                {workMode !== NO_WORK_MODE && <WorkModeBadge workMode={workMode} />}
              </div>
            )}
          </div>
          {/* Plain text, never HTML: the description is whatever the employer typed. */}
          <p className="min-h-24 text-sm whitespace-pre-wrap wrap-anywhere">
            {description.trim() || <span className="text-muted-foreground">The description appears here.</span>}
          </p>
          <div className="grid gap-2">
            <Button type="button" size="lg" className="w-full sm:w-fit">
              <UploadIcon aria-hidden /> Upload CV
            </Button>
            <p className="text-xs text-muted-foreground">Preview: candidates will upload their CV here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
