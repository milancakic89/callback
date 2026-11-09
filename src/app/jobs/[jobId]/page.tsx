import { ArrowLeftIcon, MapPinIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CompanyAbout } from "@/components/company/company-about";
import { ApplyDialog } from "@/components/jobs/apply-dialog";
import { WorkModeBadge } from "@/components/jobs/work-mode-badge";
import { PublicHeader } from "@/components/public-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/dal";
import { companyProfilePath, hasCompanyDetails, type CompanyProfile } from "@/lib/companies/profile";
import { getCompanyProfile } from "@/lib/companies/profile-queries";
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
      <PublicHeader />
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

// The "About" card is extra to the posting: a company profile that can't be read must not take the job
// down with it, so the page shows the job without it and logs why.
async function loadCompanyProfile(slug: string): Promise<CompanyProfile | null> {
  try {
    return await getCompanyProfile(slug);
  } catch (error) {
    console.error("loadCompanyProfile failed:", error);
    return null;
  }
}

async function Posting({ params }: { params: Params }) {
  const job = await getPublishedJob((await params).jobId);
  if (!job) notFound();
  const companyProfile = await loadCompanyProfile(job.companySlug);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-6">
        <Card>
          <CardHeader className="gap-3">
            <CardTitle className="text-2xl leading-tight">{job.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <Link
                href={companyProfilePath(job.companySlug)}
                className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {job.companyName}
              </Link>
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

        {companyProfile && hasCompanyDetails(companyProfile) && (
          <CompanyAbout profile={companyProfile}>
            <Link
              href={companyProfilePath(job.companySlug)}
              className="w-fit rounded-sm text-sm font-medium underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              View company profile and open positions
            </Link>
          </CompanyAbout>
        )}
      </div>

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
