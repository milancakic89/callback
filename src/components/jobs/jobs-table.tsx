"use client";

import { EyeIcon } from "lucide-react";
import { AppliedCheckbox } from "./applied-checkbox";
import { HEADER_CLASS, PageSizeSelect, Pager, ROW_CLASS, SortableHead } from "./table-parts";
import { WorkModeBadge } from "./work-mode-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SortDirection, SortField } from "@/lib/jobs/filter";
import { formatAbsolute, formatRelative } from "@/lib/jobs/format";
import { sourceLabel, type JobListItem } from "@/lib/jobs/types";
import { cn } from "cn";

export type JobsTableProps = {
  rows: JobListItem[];
  matchCount: number;
  totalCount: number;
  page: number;
  pageCount: number;
  pageSize: number;
  sort: SortField;
  direction: SortDirection;
  showApplied: boolean;
  appliedIds: Set<string>;
  pendingAppliedId: string | null;
  appliedErrors: Record<string, string>;
  loading: boolean;
  // Omitted by the static Suspense fallback (jobs-explorer-fallback.tsx): there's no live clock
  // during a prerender, so Posted falls back to an absolute date instead of "3d ago" there.
  now?: number;
  // When true, this card fills its container's height and only its rows scroll (the toolbar and
  // pager stay put, and the header row stays stuck to the top of that scroll). Needs a sized
  // ancestor — see the `fillHeight` prop on jobs-explorer.tsx, which drives this.
  scrollable?: boolean;
  // Optional so the static Suspense fallback (jobs-explorer-fallback.tsx) can render this table
  // with no interactivity at all, without passing functions across a server/client boundary.
  onSortChange?: (field: SortField) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onRequestApply?: (job: JobListItem) => void;
  onClearFilters?: () => void;
  onViewJob?: (job: JobListItem) => void;
};

function noop() {}

function PostedCell({ job, now }: { job: JobListItem; now?: number }) {
  // No live clock during a prerender (the static Suspense fallback has no `now`) — an absolute
  // date is deterministic, "3d ago" isn't.
  if (now === undefined) {
    return <span>{formatAbsolute(job.postedAt ?? job.firstSeenAt)}</span>;
  }
  if (job.postedAt) return <span>{formatRelative(job.postedAt, now)}</span>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="text-muted-foreground" />}>
        {formatRelative(job.firstSeenAt, now)}
      </TooltipTrigger>
      <TooltipContent>First seen {formatAbsolute(job.firstSeenAt)}</TooltipContent>
    </Tooltip>
  );
}

export function JobsTable({
  rows,
  matchCount,
  totalCount,
  page,
  pageCount,
  pageSize,
  sort,
  direction,
  showApplied,
  appliedIds,
  pendingAppliedId,
  appliedErrors,
  loading,
  now,
  scrollable = false,
  onSortChange = noop,
  onPageChange = noop,
  onPageSizeChange = noop,
  onRequestApply = noop,
  onClearFilters = noop,
  onViewJob = noop,
}: JobsTableProps) {
  const from = matchCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, matchCount);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10",
        scrollable ? "h-full min-h-0" : "gap-3",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 px-4 pt-4",
          scrollable && "shrink-0 pb-3",
        )}
      >
        <p className="text-sm text-muted-foreground">
          {loading ? (
            "Loading…"
          ) : (
            <>
              Showing <span className="font-medium text-foreground">{from}–{to}</span> of{" "}
              <span className="font-medium text-foreground">{matchCount}</span> · {totalCount} total
            </>
          )}
        </p>
        <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
      </div>

      <div className={cn(scrollable && "min-h-0 flex-1 overflow-auto")}>
        {/* Table's own wrapper defaults to overflow-x-auto, which (per the CSS overflow spec)
            quietly computes overflow-y: auto too and becomes its own scroll container — stealing
            the sticky header below, which then sticks to *that* unbounded-height box instead of
            the div right above, and just scrolls away with everything else. Cancel it explicitly
            (a plain "relative w-full" doesn't — tailwind-merge only drops a class it sees a
            replacement for) so there's one scroll container here, not two. */}
        <Table containerClassName={scrollable ? "relative w-full overflow-x-visible" : undefined}>
          {/* Overrides the shared TableHeader's default row border — the colored band has no need
              for one. Sticky (scrollable mode only) so the band stays pinned while rows scroll beneath it. */}
          <TableHeader className={cn("[&_tr]:border-b-0", scrollable && "sticky top-0 z-10")}>
            <TableRow className="hover:bg-transparent">
              <SortableHead
                field="title"
                label="Label"
                sort={sort}
                direction={direction}
                onSortChange={onSortChange}
                className="py-3 pl-4"
              />
              <TableHead className={cn(HEADER_CLASS, "py-3")}>Location</TableHead>
              <SortableHead
                field="company"
                label="Company"
                sort={sort}
                direction={direction}
                onSortChange={onSortChange}
                className="py-3"
              />
              <TableHead className={cn(HEADER_CLASS, "py-3")}>Source</TableHead>
              <SortableHead
                field="posted"
                label="Posted"
                sort={sort}
                direction={direction}
                onSortChange={onSortChange}
                className="py-3"
              />
              <SortableHead
                field="workMode"
                label="Work mode"
                sort={sort}
                direction={direction}
                onSortChange={onSortChange}
                className="py-3"
              />
              {showApplied && <TableHead className={cn(HEADER_CLASS, "py-3")}>Applied</TableHead>}
              <TableHead className={cn(HEADER_CLASS, "py-3 pr-4")}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <TableRow key={index} className={cn(ROW_CLASS, "hover:bg-transparent")}>
                  <TableCell colSpan={showApplied ? 8 : 7} className="px-4 py-3">
                    <Skeleton className="h-5 w-full max-w-md" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className={cn(ROW_CLASS, "hover:bg-transparent")}>
                <TableCell colSpan={showApplied ? 8 : 7} className="px-4 py-10 text-center whitespace-normal">
                  <p className="text-sm text-muted-foreground">No jobs match.</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearFilters}>
                    Clear filters
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((job) => (
                <TableRow key={job.id} className={ROW_CLASS}>
                  <TableCell className="max-w-72 py-3 pl-4">
                    {job.url ? (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {job.title}
                      </a>
                    ) : (
                      <span className="block truncate font-medium">{job.title}</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-48 truncate py-3 text-muted-foreground">
                    {job.locationRaw ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-56 truncate py-3 text-muted-foreground">{job.companyName}</TableCell>
                  <TableCell className="py-3 text-muted-foreground">{sourceLabel(job.source)}</TableCell>
                  <TableCell className="py-3">
                    <PostedCell job={job} now={now} />
                  </TableCell>
                  <TableCell className="py-3">
                    <WorkModeBadge workMode={job.workMode} />
                  </TableCell>
                  {showApplied && (
                    <TableCell className="py-3">
                      <AppliedCheckbox
                        jobTitle={job.title}
                        applied={appliedIds.has(job.id)}
                        pending={pendingAppliedId === job.id}
                        error={appliedErrors[job.id] ?? null}
                        onRequestApply={() => onRequestApply(job)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="py-3 pr-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onViewJob(job)}
                      aria-label={`View description for ${job.title}`}
                    >
                      <EyeIcon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pager page={page} pageCount={pageCount} onPageChange={onPageChange} className={cn(scrollable && "shrink-0 pt-3")} />
    </div>
  );
}
