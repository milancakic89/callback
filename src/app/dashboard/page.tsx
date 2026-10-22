import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { JobsExplorer } from "@/components/jobs/jobs-explorer";
import { JobsExplorerFallback } from "@/components/jobs/jobs-explorer-fallback";
import { requireUser } from "@/lib/auth/dal";
import { getActiveJobs, getAppliedJobIds } from "@/lib/jobs/queries";
import type { JobListItem } from "@/lib/jobs/types";

export const metadata: Metadata = { title: "Dashboard | Job Manager" };

// Fixed app shell (h-dvh, no page scroll): a sidebar plus the job table, both filling the
// viewport. Only the table's rows scroll — see the `fillHeight`/`scrollable` plumbing in
// jobs-explorer.tsx and jobs-table.tsx. `getActiveJobs` is cached and cookie-free, so it's safe
// to call outside Suspense; the per-user parts (account, applied IDs) read cookies and must stay
// inside one.
export default async function DashboardPage() {
  const jobs = await getActiveJobs();

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-muted/30">
      <DashboardSidebar>
        <Suspense fallback={<div className="h-20 shrink-0 border-t border-border" />}>
          <SidebarAccount />
        </Suspense>
      </DashboardSidebar>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-6 py-6">
        {/* No page heading — the sidebar's "Home" nav item already says where you are. */}
        <Suspense fallback={<JobsExplorerFallback jobs={jobs} showApplied fillHeight />}>
          <AuthedJobsExplorer jobs={jobs} />
        </Suspense>
      </main>
    </div>
  );
}

async function SidebarAccount() {
  // Opt out of prerendering: the Supabase client reads Date.now() while verifying the JWT.
  await connection();
  const user = await requireUser();

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3">
      <span className="truncate text-xs text-muted-foreground" title={user.email}>
        {user.email}
      </span>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm" className="w-full">
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
  return (
    <JobsExplorer jobs={jobs} now={now} showApplied initialAppliedIds={appliedIds} fillHeight />
  );
}
