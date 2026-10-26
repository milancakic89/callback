import { BriefcaseBusinessIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { JobCard } from "@/components/employer/job-card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAccountType } from "@/lib/auth/dal";
import type { Company } from "@/lib/companies/company";
import { getCompanyOrNotFound } from "@/lib/companies/get-company";
import { ensureEmployerWorkspace, getCompanyJobs } from "@/lib/companies/workspace";

export const metadata: Metadata = { title: "Dashboard | Callback" };

type Params = Promise<{ company: string }>;

// The employer home (features/companies.md, features/demo-job.md): the company's jobs with their
// applicants, or an offer to create the first one. The heading is static. The slug, the account
// check and the jobs are per-request data, so the page passes `params` down and all are read inside
// Suspense.
export default function EmployerDashboardPage({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Employer dashboard</h1>
      <Suspense fallback={<Skeleton className="h-52 max-w-2xl rounded-xl" />}>
        <AuthedEmployerDashboard params={params} />
      </Suspense>
    </div>
  );
}

async function AuthedEmployerDashboard({ params }: { params: Params }) {
  const company = await getCompanyOrNotFound(params);
  await connection();
  await requireAccountType("employer");

  // The first visit makes the company and its demo job, so this has to run before the read.
  await ensureEmployerWorkspace();
  const jobs = await getCompanyJobs();
  if (jobs.length === 0) return <EmptyState company={company} />;

  return (
    <div className="flex flex-col items-start gap-4">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
      <Link href={`/${company.slug}/jobs/new`} className={buttonVariants({ variant: "outline" })}>
        <PlusIcon aria-hidden /> Create job
      </Link>
    </div>
  );
}

function EmptyState({ company }: { company: Company }) {
  return (
    <div className="flex max-w-2xl flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-card p-6 sm:p-8">
      <span className="inline-flex size-10 items-center justify-center rounded-lg bg-muted">
        <BriefcaseBusinessIcon aria-hidden className="size-5 text-muted-foreground" />
      </span>
      <p className="font-medium">No jobs yet</p>
      <p className="text-sm text-muted-foreground">
        Post a job and candidates who apply through Callback are tracked automatically.
      </p>
      <Link href={`/${company.slug}/jobs/new`} className={buttonVariants({ size: "lg" })}>
        <PlusIcon aria-hidden /> Create your first job
      </Link>
    </div>
  );
}
