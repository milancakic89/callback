import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { JobsExplorer } from "@/components/jobs/jobs-explorer";
import { JobsExplorerFallback } from "@/components/jobs/jobs-explorer-fallback";
import { requireUser } from "@/lib/auth/dal";
import { getActiveJobs, getAppliedJobIds, getSavedJobIds } from "@/lib/jobs/queries";
import type { JobListItem } from "@/lib/jobs/types";

export const metadata: Metadata = { title: "Dashboard | Job Manager" };

// The shell (sidebar, account block) lives in ../layout.tsx. `getActiveJobs` is cached and
// cookie-free, so it's safe to call outside Suspense; the per-user part (applied IDs) reads
// cookies and must stay inside one.
export default async function DashboardPage() {
  const jobs = await getActiveJobs();

  // No page heading — the sidebar's "Home" nav item already says where you are.
  return (
    <Suspense fallback={<JobsExplorerFallback jobs={jobs} showApplied showSaved fillHeight />}>
      <AuthedJobsExplorer jobs={jobs} />
    </Suspense>
  );
}

async function AuthedJobsExplorer({ jobs }: { jobs: JobListItem[] }) {
  await connection();
  const user = await requireUser();
  const [appliedIds, savedIds] = await Promise.all([getAppliedJobIds(user.id), getSavedJobIds(user.id)]);

  // react-hooks/purity doesn't know about Next's dynamic-API opt-out: connection() above is
  // exactly what makes a per-request value like this safe to read here — see src/app/page.tsx.
  // eslint-disable-next-line react-hooks/purity -- request-time value, gated by connection() above
  const now = Date.now();
  return (
    <JobsExplorer
      jobs={jobs}
      now={now}
      showApplied
      initialAppliedIds={appliedIds}
      showSaved
      initialSavedIds={savedIds}
      fillHeight
    />
  );
}
