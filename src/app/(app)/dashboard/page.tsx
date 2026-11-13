import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { JobsExplorer } from "@/components/jobs/jobs-explorer";
import { JobsExplorerFallback } from "@/components/jobs/jobs-explorer-fallback";
import { requireAccountType } from "@/lib/auth/dal";
import { previewOf, type JobsPreview } from "@/lib/jobs/preview";
import { getActiveJobs, getAppliedJobIds, getSavedJobIds } from "@/lib/jobs/queries";

export const metadata: Metadata = { title: "Dashboard | Callback" };

// The shell (sidebar, account block) lives in ../layout.tsx. `getActiveJobs` is cached and
// cookie-free, so it's safe to call outside Suspense; the per-user part (applied and saved IDs)
// reads cookies and must stay inside one. The page carries only the first rows of the table and the
// job count (features/performance.md): the explorer loads the whole list from /api/jobs/list, and
// the dynamic part sends nothing of it, so a request no longer serializes 6,000 jobs.
export default async function DashboardPage() {
  const preview = previewOf(await getActiveJobs());

  // No page heading — the sidebar's "Home" nav item already says where you are.
  return (
    <Suspense fallback={<JobsExplorerFallback {...preview} showApplied showSaved fillHeight />}>
      <AuthedJobsExplorer preview={preview} />
    </Suspense>
  );
}

async function AuthedJobsExplorer({ preview }: { preview: JobsPreview }) {
  await connection();
  const user = await requireAccountType("candidate");
  const [appliedIds, savedIds] = await Promise.all([getAppliedJobIds(user.id), getSavedJobIds(user.id)]);

  return (
    <JobsExplorer
      {...preview}
      showApplied
      initialAppliedIds={appliedIds}
      showSaved
      initialSavedIds={savedIds}
      fillHeight
    />
  );
}
