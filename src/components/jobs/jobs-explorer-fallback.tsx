"use client";

import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sortJobs } from "@/lib/jobs/filter";
import type { JobListItem } from "@/lib/jobs/types";
import { cn } from "cn";
import { JobsTable } from "./jobs-table";

type JobsExplorerFallbackProps = {
  jobs: JobListItem[];
  showApplied?: boolean;
  initialAppliedIds?: string[];
  showSaved?: boolean;
  // Skeleton rows instead of the (empty or unfiltered) job list, for pages with no static data to
  // show yet, e.g. /saved-jobs, whose list is per-user.
  loading?: boolean;
  // Mirrors JobsExplorer's prop of the same name — see jobs-explorer.tsx.
  fillHeight?: boolean;
};

const PAGE_SIZE = 20;

// The Suspense fallback for <JobsExplorer>, which calls useSearchParams and so renders
// client-side only past its boundary (see features/dashboard.md "Constraints from the Next.js 16
// docs"). This is the static shell instead: unfiltered, first page, Posted newest-first, no
// interactivity — a Client Component with no handlers, so it needs no functions passed in from a
// Server Component. Replaced the instant JobsExplorer hydrates.
export function JobsExplorerFallback({
  jobs,
  showApplied = false,
  initialAppliedIds = [],
  showSaved = false,
  loading = false,
  fillHeight = false,
}: JobsExplorerFallbackProps) {
  const sorted = sortJobs(jobs, "posted", "desc");

  return (
    <div className={cn("flex flex-col gap-4", fillHeight && "md:h-full md:min-h-0")}>
      <div className="h-9 w-full shrink-0 rounded-lg border border-input bg-transparent" aria-hidden />
      {/* Mirrors FilterBar's no-rules layout so its real "+ Add filter" button doesn't shift the
          table down once JobsExplorer hydrates and replaces this fallback. */}
      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled>
            <PlusIcon /> Add filter
          </Button>
        </div>
      </div>
      <div className={cn(fillHeight && "md:min-h-0 md:flex-1")}>
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
          showSaved={showSaved}
          savedIds={new Set()}
          pendingSavedIds={new Set()}
          savedErrors={{}}
          loading={loading}
          scrollable={fillHeight}
        />
      </div>
    </div>
  );
}
