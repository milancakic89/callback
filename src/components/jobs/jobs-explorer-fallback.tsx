"use client";

import { sortJobs } from "@/lib/jobs/filter";
import type { JobListItem } from "@/lib/jobs/types";
import { cn } from "cn";
import { JobsTable } from "./jobs-table";

type JobsExplorerFallbackProps = {
  jobs: JobListItem[];
  showApplied?: boolean;
  initialAppliedIds?: string[];
  // Mirrors JobsExplorer's prop of the same name — see jobs-explorer.tsx.
  fillHeight?: boolean;
};

const PAGE_SIZE = 50;

// The Suspense fallback for <JobsExplorer>, which calls useSearchParams and so renders
// client-side only past its boundary (see features/dashboard.md "Constraints from the Next.js 16
// docs"). This is the static shell instead: unfiltered, first page, Posted newest-first, no
// interactivity — a Client Component with no handlers, so it needs no functions passed in from a
// Server Component. Replaced the instant JobsExplorer hydrates.
export function JobsExplorerFallback({
  jobs,
  showApplied = false,
  initialAppliedIds = [],
  fillHeight = false,
}: JobsExplorerFallbackProps) {
  const sorted = sortJobs(jobs, "posted", "desc");

  return (
    <div className={cn("flex flex-col gap-4", fillHeight && "h-full min-h-0")}>
      <div className="h-9 w-full shrink-0 rounded-lg border border-input bg-transparent" aria-hidden />
      <div className={cn(fillHeight && "min-h-0 flex-1")}>
        <JobsTable
          rows={sorted.slice(0, PAGE_SIZE)}
          matchCount={jobs.length}
          totalCount={jobs.length}
          page={1}
          pageCount={Math.max(1, Math.ceil(jobs.length / PAGE_SIZE))}
          pageSize={PAGE_SIZE}
          sort="posted"
          direction="desc"
          showApplied={showApplied}
          appliedIds={new Set(initialAppliedIds)}
          pendingAppliedId={null}
          appliedErrors={{}}
          loading={false}
          scrollable={fillHeight}
        />
      </div>
    </div>
  );
}
