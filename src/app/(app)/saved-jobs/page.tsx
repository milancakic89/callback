import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { JobsExplorer } from "@/components/jobs/jobs-explorer";
import { JobsExplorerFallback } from "@/components/jobs/jobs-explorer-fallback";
import { requireAccountType } from "@/lib/auth/dal";
import { getAppliedJobIds, getSavedJobs } from "@/lib/jobs/queries";

export const metadata: Metadata = { title: "Saved jobs | Callback" };

// The shell (sidebar, account block) lives in ../layout.tsx. The saved list is per-user and reads
// cookies, so nothing here can be prerendered: the fallback is just the table's loading skeleton.
export default function SavedJobsPage() {
  return (
    <Suspense fallback={<JobsExplorerFallback jobs={[]} showApplied showSaved loading fillHeight />}>
      <AuthedSavedJobs />
    </Suspense>
  );
}

async function AuthedSavedJobs() {
  await connection();
  const user = await requireAccountType("candidate");
  const [jobs, appliedIds] = await Promise.all([getSavedJobs(user.id), getAppliedJobIds(user.id)]);

  // react-hooks/purity doesn't know about Next's dynamic-API opt-out: connection() above is
  // exactly what makes a per-request value like this safe to read here — see dashboard/page.tsx.
  // eslint-disable-next-line react-hooks/purity -- request-time value, gated by connection() above
  const now = Date.now();
  return (
    <JobsExplorer
      jobs={jobs}
      now={now}
      showApplied
      initialAppliedIds={appliedIds}
      showSaved
      initialSavedIds={jobs.map((job) => job.id)}
      savedOnly
      fillHeight
    />
  );
}
