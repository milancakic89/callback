import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { JobsExplorer } from "@/components/jobs/jobs-explorer";
import { JobsExplorerFallback } from "@/components/jobs/jobs-explorer-fallback";
import { requireUser } from "@/lib/auth/dal";
import { getActiveJobs, getAppliedJobIds } from "@/lib/jobs/queries";
import type { JobListItem } from "@/lib/jobs/types";

export const metadata: Metadata = { title: "Dashboard | Job Manager" };

// Same table as "/" (see features/dashboard.md), plus the Applied column and filter. `getActiveJobs`
// is cached and cookie-free, so it's safe to call outside Suspense; the per-user parts (account
// menu, applied IDs) read cookies and must stay inside one.
export default async function DashboardPage() {
  const jobs = await getActiveJobs();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="font-heading text-base font-semibold tracking-tight">Job Manager</span>
          <Suspense fallback={<div className="h-8 w-44" />}>
            <AccountMenu />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            {jobs.length} active postings. Mark the ones you&apos;ve applied to.
          </p>
        </div>

        <Suspense fallback={<JobsExplorerFallback jobs={jobs} showApplied />}>
          <AuthedJobsExplorer jobs={jobs} />
        </Suspense>
      </main>
    </div>
  );
}

async function AccountMenu() {
  // Opt out of prerendering: the Supabase client reads Date.now() while verifying the JWT.
  await connection();
  const user = await requireUser();

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}

async function AuthedJobsExplorer({ jobs }: { jobs: JobListItem[] }) {
  await connection();
  const user = await requireUser();
  const appliedIds = await getAppliedJobIds(user.id);

  // react-hooks/purity doesn't know about Next's dynamic-API opt-out: connection() above is
  // exactly what makes a per-request value like this safe to read here — see src/app/page.tsx.
  // eslint-disable-next-line react-hooks/purity -- request-time value, gated by connection() above
  const now = Date.now();
  return <JobsExplorer jobs={jobs} now={now} showApplied initialAppliedIds={appliedIds} />;
}
