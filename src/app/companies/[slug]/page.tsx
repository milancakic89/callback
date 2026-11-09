import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompanyAbout } from "@/components/company/company-about";
import { OpenPositions } from "@/components/company/open-positions";
import { PublicHeader } from "@/components/public-header";
import { Skeleton } from "@/components/ui/skeleton";
import { hasCompanyDetails } from "@/lib/companies/profile";
import { getCompanyProfile } from "@/lib/companies/profile-queries";
import { truncateText } from "@/lib/jobs/format";
import { getCompanyPublishedJobs } from "@/lib/jobs/queries";

type Params = Promise<{ slug: string }>;

const DESCRIPTION_LENGTH_IN_RESULTS = 160;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const profile = await getCompanyProfile((await params).slug);
  if (!profile) return { title: "Company | Callback" };
  return {
    title: `${profile.name} | Callback`,
    description: profile.description
      ? truncateText(profile.description, DESCRIPTION_LENGTH_IN_RESULTS)
      : `Open positions at ${profile.name}.`,
  };
}

// A company's public page (features/company-profile.md), open to everyone: what the company does, and
// the jobs it has published. The profile and the jobs come from cached, cookie-free reads; the header's
// account link is the only part that reads the session, in its own Suspense boundary. A slug that
// isn't a company's, or a company that hasn't been set up, is the ordinary not-found page.
export default function CompanyPage({ params }: { params: Params }) {
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
        <Suspense fallback={<CompanySkeleton />}>
          <Company params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function Company({ params }: { params: Params }) {
  const { slug } = await params;
  const [profile, jobs] = await Promise.all([getCompanyProfile(slug), getCompanyPublishedJobs(slug)]);
  if (!profile) notFound();

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-semibold tracking-tight wrap-anywhere">{profile.name}</h1>
      {hasCompanyDetails(profile) && <CompanyAbout profile={profile} />}
      <OpenPositions jobs={jobs} />
    </div>
  );
}

function CompanySkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-9 w-64 rounded-lg" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
