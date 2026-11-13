import type { Metadata } from "next";
import { Suspense } from "react";
import { JobsExplorer } from "@/components/jobs/jobs-explorer";
import { JobsExplorerFallback } from "@/components/jobs/jobs-explorer-fallback";
import { SiteNav } from "@/components/site-nav";
import { previewOf } from "@/lib/jobs/preview";
import { getActiveJobs } from "@/lib/jobs/queries";

export const metadata: Metadata = {
  title: "Jobs | Callback",
  description: "Browse active job listings in Serbia and remote, with search and filters.",
};

// Public job list (Phase 2, features/dashboard.md). It lived at / until the landing page took that
// route (features/landing.md). A signed-in visitor never sees this page — src/proxy.ts redirects
// them to /dashboard, which shows the same table plus an Applied column.
//
// Fully static (features/performance.md): the page carries only the first rows of the table and the
// job count, and the explorer loads the whole list from /api/jobs/list once it is up, taking its
// clock from the browser then. It used to be rendered for every request with all 6,000 jobs in it,
// which was 6.5 MB of HTML each time and the slowest page by far.
export default async function JobsPage() {
  const { previewRows, totalCount } = previewOf(await getActiveJobs());

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <SiteNav />

      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* No page heading — the nav above already says where you are. */}
        <Suspense fallback={<JobsExplorerFallback previewRows={previewRows} totalCount={totalCount} />}>
          <JobsExplorer previewRows={previewRows} totalCount={totalCount} />
        </Suspense>
      </main>
    </div>
  );
}
