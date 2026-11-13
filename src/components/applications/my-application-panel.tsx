import { CircleCheckIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";
import { CandidateStage } from "@/components/applications/candidate-stage";
import { InterviewInvitation } from "@/components/applications/interview-invitation";
import { WithdrawButton } from "@/components/applications/withdraw-button";
import type { CallbackApplication } from "@/lib/cvs/types";
import { formatAbsolute } from "@/lib/jobs/format";
import { documentUrl } from "@/lib/review/documents";

// Explicit so the day doesn't depend on whether the server or the browser formats it.
const TIME_ZONE = "Europe/Belgrade";

// The candidate's own application to a job posted on Callback, on that job's page
// (features/callback-applications-in-table.md): when it was sent, the status the company applied, the
// CV and the cover letter the company can read, and Withdraw while it can. The table on /applications
// has only the row; this is where the rest is. No hooks: Withdraw is its own client component.
export function MyApplicationPanel({ application }: { application: CallbackApplication }) {
  const holdsDocuments = application.state === "active" || application.state === "paused";

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <CircleCheckIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div className="grid min-w-0 gap-1.5">
          <p className="font-medium">You applied on {formatAbsolute(application.appliedAt, TIME_ZONE)}</p>
          <StateLine application={application} />
        </div>
      </div>

      {application.status && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Status</span>
          <CandidateStage status={application.status} />
        </div>
      )}

      {application.interview && holdsDocuments && (
        <InterviewInvitation interview={application.interview} companyName={application.companyName} />
      )}

      {holdsDocuments && <Documents application={application} />}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {holdsDocuments && (
          <WithdrawButton
            applicationId={application.id}
            jobTitle={application.title}
            companyName={application.companyName}
          />
        )}
        <Link
          href="/applications"
          className="rounded-sm text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          All your applications
        </Link>
      </div>
    </div>
  );
}

function StateLine({ application }: { application: CallbackApplication }) {
  switch (application.state) {
    case "active":
      return (
        <p className="text-sm text-muted-foreground">
          {application.companyName} can read your application. Its status updates here by itself.
        </p>
      );
    case "paused":
      return (
        <p className="text-sm text-muted-foreground">
          {application.companyName} has paused this job. They keep your application until you withdraw it or they
          open the job again.
        </p>
      );
    case "withdrawn":
      return <p className="text-sm text-muted-foreground">{application.companyName} withdrew your application.</p>;
    case "you_withdrew":
      return (
        <p className="text-sm text-muted-foreground">
          You withdrew your application. You can&apos;t apply to this job again.
        </p>
      );
  }
}

// The documents the company can read, which are the candidate's to see too. The CV and a PDF cover
// letter open in a tab through the document route; a typed one is plain text, never HTML.
function Documents({ application }: { application: CallbackApplication }) {
  return (
    <div className="grid gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {application.cvFileName && (
          <a
            href={documentUrl(application.id, "cv")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <FileTextIcon aria-hidden className="size-4 shrink-0" />
            <span className="truncate">CV: {application.cvFileName}</span>
          </a>
        )}
        {application.coverLetter?.kind === "pdf" && (
          <a
            href={documentUrl(application.id, "cover-letter")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ExternalLinkIcon aria-hidden className="size-4" /> Cover letter (PDF)
          </a>
        )}
        {!application.coverLetter && <span className="text-muted-foreground">No cover letter</span>}
      </div>
      {application.coverLetter?.kind === "text" && (
        <details className="group">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Your cover letter</summary>
          <p className="mt-2 rounded-lg bg-muted/50 p-3 leading-relaxed whitespace-pre-wrap">
            {application.coverLetter.text}
          </p>
        </details>
      )}
    </div>
  );
}
