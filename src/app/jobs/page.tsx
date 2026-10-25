import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { JobsExplorer } from "@/components/jobs/jobs-explorer";
import { JobsExplorerFallback } from "@/components/jobs/jobs-explorer-fallback";
import { SiteNav } from "@/components/site-nav";
import { getActiveJobs } from "@/lib/jobs/queries";
import type { JobListItem } from "@/lib/jobs/types";

export const metadata: Metadata = {
  title: "Jobs | Callback",
  description: "Browse active job listings in Serbia and remote, with search and filters.",
};

// Public job list (Phase 2, features/dashboard.md). It lived at / until the landing page took that
// route (features/landing.md). A signed-in visitor never sees this page — src/proxy.ts redirects
// them to /dashboard, which shows the same table plus an Applied column.
export default async function JobsPage() {
  const jobs = await getActiveJobs();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <SiteNav />

      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* No page heading — the nav above already says where you are. */}
        <Suspense fallback={<JobsExplorerFallback jobs={jobs} />}>
          <LiveJobsExplorer jobs={jobs} />
        </Suspense>
      </main>
    </div>
  );
}

async function LiveJobsExplorer({ jobs }: { jobs: JobListItem[] }) {
  // Opts out of the static prerender: `now` (for "3d ago") must come from the server's clock at
  // request time, not get baked into the build's static shell — see jobs-explorer.tsx.
  await connection();
  // react-hooks/purity doesn't know about Next's dynamic-API opt-out: `connection()` above is
  // exactly what makes a per-request value like this safe to read here, per Next's own docs.
  // eslint-disable-next-line react-hooks/purity -- request-time value, gated by connection() above
  const now = Date.now();
  return <JobsExplorer jobs={jobs} now={now} />;
}
