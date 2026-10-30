import { InfoIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CompanyJob } from "@/lib/companies/workspace";
import { DeleteJobButton } from "./delete-job-button";
import { PublishJobButton } from "./publish-job-button";
import { UnpublishJobButton, type MoveTarget } from "./unpublish-job-button";

// Every card is the same size, and the row it is in holds three at most. The width is a share of the
// row, not a fixed number, so three fit however wide the screen is: one to a row on a narrow
// container, two from 36rem, three from 56rem, never wider than 30rem. The shares assume the row's
// `gap-4` (1rem). The row (src/app/(employer)/[company]/page.tsx) is the `@container` these query.
export const JOB_CARD_WIDTH =
  "w-full max-w-[30rem] @xl:w-[calc((100%_-_1rem)/2)] @4xl:w-[calc((100%_-_2rem)/3)]";

const START_HINT ="“Lets start” will be available once the job has applicants.";

// One of the company's jobs on its dashboard (features/demo-job.md, features/job-publishing.md): the
// title with its state (Published or Draft), how many people applied (and how many were withdrawn),
// and the buttons: Edit, Publish or Unpublish, and the one that will start reviewing the applicants
// (disabled while there are none, with an info icon that says why).
// Who they are is for the review itself. The demo job is private and fixed, so it has no Edit and no
// Publish; it can still be deleted. `moveTargets` are the company's other jobs the applicants of this
// one can be moved to when it is unpublished.
export function JobCard({
  job,
  companySlug,
  moveTargets,
}: {
  job: CompanyJob;
  companySlug: string;
  moveTargets: MoveTarget[];
}) {
  const published = job.publishedAt !== null;
  const noApplicants = job.applicantCount === 0;

  return (
    <Card className={JOB_CARD_WIDTH}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {job.title}
          {job.isDemo ? (
            <Badge variant="secondary">Demo</Badge>
          ) : (
            <Badge variant={published ? "default" : "outline"}>{published ? "Published" : "Draft"}</Badge>
          )}
        </CardTitle>
        {job.isDemo && (
          <CardDescription>
            A sample job with fictional applicants. Delete it whenever you like.
          </CardDescription>
        )}
        <CardAction>
          <DeleteJobButton jobId={job.id} title={job.title} />
        </CardAction>
      </CardHeader>
      <CardContent className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {job.applicantCount === 1 ? "1 applicant" : `${job.applicantCount} applicants`}
          {job.withdrawnCount > 0 && (
            <span className="font-normal text-muted-foreground"> · {job.withdrawnCount} withdrawn</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {!job.isDemo && (
            <>
              <Link
                href={`/${companySlug}/jobs/${job.id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                Edit
              </Link>
              {published ? (
                <UnpublishJobButton
                  jobId={job.id}
                  title={job.title}
                  applicantCount={job.applicantCount}
                  targets={moveTargets}
                />
              ) : (
                <PublishJobButton jobId={job.id} title={job.title} />
              )}
            </>
          )}
          {/* Reviewing applicants is the next feature: like the Upload CV button in the job editor's
              preview, this does nothing yet. With no active applicants there is nothing to start. */}
          <span className="inline-flex items-center gap-1.5">
            <Button type="button" disabled={noApplicants}>
              Lets start
            </Button>
            {/* A button of its own, so it takes the focus (a disabled button can't) and the hint opens
                from the keyboard too; the label gives a screen reader the same text. */}
            {noApplicants && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={START_HINT}
                      className="rounded-full p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  }
                >
                  <InfoIcon className="size-4" aria-hidden />
                </TooltipTrigger>
                <TooltipContent>{START_HINT}</TooltipContent>
              </Tooltip>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
