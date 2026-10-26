import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompanyJob } from "@/lib/companies/workspace";
import { DeleteJobButton } from "./delete-job-button";

// One of the company's jobs on its dashboard (features/demo-job.md): the title, how many people
// applied, and the button that will start reviewing them. Who they are is for the review itself.
export function JobCard({ job }: { job: CompanyJob }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {job.title}
          {job.isDemo && <Badge variant="secondary">Demo</Badge>}
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
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {job.applicantCount === 1 ? "1 applicant" : `${job.applicantCount} applicants`}
        </p>
        {/* Reviewing applicants is the next feature: like the Apply button in the job editor's
            preview, this does nothing yet. */}
        <Button type="button">Run manual mode</Button>
      </CardContent>
    </Card>
  );
}
