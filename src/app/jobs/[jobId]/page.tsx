import { ArrowLeftIcon, MapPinIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { ApplyDialog } from "@/components/jobs/apply-dialog";
import { WorkModeBadge } from "@/components/jobs/work-mode-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { homeFor } from "@/lib/auth/account-type";
import { getCurrentUser } from "@/lib/auth/dal";
import { getMyCvs } from "@/lib/cvs/queries";
import { formatAbsolute } from "@/lib/jobs/format";
import { applyPath, type PublishedJob } from "@/lib/jobs/published";
import { getMyApplicationDate, getMyCandidateProfile, getPublishedJob } from "@/lib/jobs/queries";

type Params = Promise<{ jobId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const job = await getPublishedJob((await params).jobId);
  if (!job) return { title: "Job | Callback" };
  return { title: `${job.title} at ${job.companyName} | Callback`, description: `Apply for ${job.title} at ${job.companyName}.` };
}

// A job a company posted on Callback (features/apply-with-cv.md), open to everyone: a guest reads it
// and is offered to sign in to apply, an employer is told employers can't apply, and a candidate
// applies in a dialog with a CV from their account (features/candidate-cvs.md). The posting comes from a cached, cookie-free read; what depends on who is looking (the
// header's account link and the apply panel) reads the session, so each sits in its own Suspense
// boundary and the rest of the page prerenders. An unpublished job, the demo job and an unknown id
// are the same not-found page.
export default function PostingPage({ params }: { params: Params }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <PostingHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/jobs"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeftIcon aria-hidden className="size-4" /> All jobs
        </Link>
        <Suspense fallback={<PostingSkeleton />}>
          <Posting params={params} />
        </Suspense>
      </main>
    </div>
  );
}

// The signed-out top bar (src/components/site-nav.tsx) is for visitors with no account; a candidate
// or an employer on a posting needs a way back to their own side instead of "Log in".
function PostingHeader() {
  return (
    <header className="dark sticky top-0 z-50 border-b border-border bg-background text-foreground">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Callback home"
          className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Logo onDark className="h-[22px]" />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Suspense fallback={null}>
            <HeaderAccount />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

const HEADER_LINK =
  "rounded-md px-3 py-1.5 text-[14px] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

async function HeaderAccount() {
  await connection();
  const user = await getCurrentUser();

  if (user) {
    return (
      <Link href={homeFor(user.accountType, user.companySlug)} className={HEADER_LINK}>
        {user.accountType === "employer" ? "Your workspace" : "Dashboard"}
      </Link>
    );
  }
  return (
    <>
      <Link href="/sign-in" className={HEADER_LINK}>
        Log in
      </Link>
      <Link
        href="/sign-up"
        className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[14px] font-medium whitespace-nowrap text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Get started
      </Link>
    </>
  );
}

async function Posting({ params }: { params: Params }) {
  const job = await getPublishedJob((await params).jobId);
  if (!job) notFound();

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-2xl leading-tight">{job.title}</CardTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{job.companyName}</span>
            {job.locationRaw && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon aria-hidden className="size-3.5" /> {job.locationRaw}
              </span>
            )}
            {job.workMode && <WorkModeBadge workMode={job.workMode} />}
            <span>Posted {formatAbsolute(job.publishedAt, "UTC")}</span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Plain text, never HTML: the description is whatever the company typed. */}
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{job.description || "No description."}</p>
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-24">
        <CardHeader>
          <CardTitle>Apply for this job</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<ApplySkeleton />}>
            <ApplyPanel job={job} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function ApplyPanel({ job }: { job: PublishedJob }) {
  await connection();
  const user = await getCurrentUser();

  if (!user) {
    // Both come back here with the dialog open, the sign-up through the activation email.
    const next = encodeURIComponent(applyPath(job.id));
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">Sign in with your candidate account to send your CV.</p>
        <Link href={`/sign-in?next=${next}`} className={buttonVariants({ size: "lg", className: "w-full" })}>
          Sign in to apply
        </Link>
        <Link
          href={`/sign-up?next=${next}`}
          className={buttonVariants({ variant: "outline", size: "lg", className: "w-full" })}
        >
          Create an account
        </Link>
      </div>
    );
  }

  if (user.accountType !== "candidate") {
    return (
      <p className="text-sm text-muted-foreground">
        Employer accounts can&apos;t apply to jobs. Use a candidate account to apply.
      </p>
    );
  }

  const [appliedAt, profile, cvs] = await Promise.all([
    getMyApplicationDate(job.id),
    getMyCandidateProfile(user.id),
    getMyCvs(),
  ]);

  // Also once applied: the dialog stays mounted through the refresh that follows sending, to say so.
  return (
    <ApplyDialog
      jobId={job.id}
      jobTitle={job.title}
      companyName={job.companyName}
      cvs={cvs}
      initialName={profile?.fullName ?? ""}
      initialLocation={profile?.location ?? ""}
      appliedAt={appliedAt}
    />
  );
}

function PostingSkeleton() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

function ApplySkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}
