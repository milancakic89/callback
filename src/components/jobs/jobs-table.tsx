"use client";

import { EyeIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AppliedCheckbox } from "./applied-checkbox";
import { SaveJobButton } from "./save-job-button";
import {
  CARD_BODY_CLASS,
  CARD_FULL_CELL_CLASS,
  CARD_HEADER_CLASS,
  CARD_TABLE_CLASS,
  DataCell,
  EXPIRED_ROW_CLASS,
  HEADER_CLASS,
  MobileSort,
  PageSizeSelect,
  Pager,
  ROW_CLASS,
  SortableHead,
} from "./table-parts";
import { WorkModeBadge } from "./work-mode-badge";
import { Badge } from "@/components/ui/badge";
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
  // The Save job column (signed-in pages only) — see features/saved-jobs.md.
  showSaved: boolean;
  savedIds: Set<string>;
  pendingSavedIds: Set<string>;
  savedErrors: Record<string, string>;
  loading: boolean;
  // Omitted by the static Suspense fallback (jobs-explorer-fallback.tsx): there's no live clock
  // during a prerender, so Posted falls back to an absolute date instead of "3d ago" there.
  now?: number;
  // When true, this card fills its container's height and only its rows scroll (the toolbar and
  // pager stay put, and the header row stays stuck to the top of that scroll). Needs a sized
  // ancestor — see the `fillHeight` prop on jobs-explorer.tsx, which drives this. Only from `md` up:
  // below it the rows are tall cards, so the whole page scrolls instead.
  scrollable?: boolean;
  // Optional so the static Suspense fallback (jobs-explorer-fallback.tsx) can render this table
  // with no interactivity at all, without passing functions across a server/client boundary.
  onSortChange?: (field: SortField) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onRequestApply?: (job: JobListItem) => void;
  onToggleSaved?: (job: JobListItem, next: boolean) => void;
  onClearFilters?: () => void;
  onViewJob?: (job: JobListItem) => void;
  // Shown instead of "No jobs match" when there are no jobs at all (not just no matches), e.g. an
  // empty /saved-jobs.
  emptyState?: ReactNode;
};

function noop() {}

// On a card the row is a two-column grid with just three lines — Label · eye, Work mode · heart,
// Company · Applied checkbox — and the other cells are hidden. The cells pick their spot with
// `max-md:col-start-* max-md:row-start-*`, so their order in the markup (the desktop column order)
// doesn't matter, and a missing column (no Applied / Save job when signed out) just leaves a gap.
const CARD_GRID_CLASS = "max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3";

// The sortable columns, for the sort picker that stands in for the header band on cards.
const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "title", label: "Label" },
  { field: "company", label: "Company" },
  { field: "posted", label: "Posted" },
  { field: "workMode", label: "Work mode" },
];

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
  showSaved,
  savedIds,
  pendingSavedIds,
  savedErrors,
  loading,
  now,
  scrollable = false,
  emptyState,
  onSortChange = noop,
  onPageChange = noop,
  onPageSizeChange = noop,
  onRequestApply = noop,
  onToggleSaved = noop,
  onClearFilters = noop,
  onViewJob = noop,
}: JobsTableProps) {
  const from = matchCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, matchCount);
  const columnCount = 7 + Number(showApplied) + Number(showSaved);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10",
        scrollable ? "gap-3 md:h-full md:min-h-0 md:gap-0" : "gap-3",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 px-4 pt-4",
          scrollable && "md:shrink-0 md:pb-3",
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <MobileSort options={SORT_OPTIONS} sort={sort} direction={direction} onSortChange={onSortChange} />
          <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
        </div>
      </div>

      <div className={cn(scrollable && "md:min-h-0 md:flex-1 md:overflow-auto")}>
        {/* Table's own wrapper defaults to overflow-x-auto, which (per the CSS overflow spec)
            quietly computes overflow-y: auto too and becomes its own scroll container — stealing
            the sticky header below, which then sticks to *that* unbounded-height box instead of
            the div right above, and just scrolls away with everything else. Cancel it explicitly
            (a plain "relative w-full" doesn't — tailwind-merge only drops a class it sees a
            replacement for) so there's one scroll container here, not two. */}
        <Table
          className={CARD_TABLE_CLASS}
          containerClassName={scrollable ? "relative w-full overflow-x-visible" : undefined}
        >
          {/* Overrides the shared TableHeader's default row border — the colored band has no need
              for one. Sticky (scrollable mode only) so the band stays pinned while rows scroll beneath it. */}
          <TableHeader className={cn("[&_tr]:border-b-0", CARD_HEADER_CLASS, scrollable && "sticky top-0 z-10")}>
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
              {showSaved && <TableHead className={cn(HEADER_CLASS, "py-3")}>Save job</TableHead>}
              <TableHead className={cn(HEADER_CLASS, "py-3 pr-4")}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={CARD_BODY_CLASS}>
            {loading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <TableRow key={index} className={cn(ROW_CLASS, "hover:bg-transparent")}>
                  <TableCell colSpan={columnCount} className={cn("px-4 py-3", CARD_FULL_CELL_CLASS)}>
                    <Skeleton className="h-5 w-full max-w-md" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className={cn(ROW_CLASS, "hover:bg-transparent")}>
                <TableCell colSpan={columnCount} className={cn("px-4 py-10 text-center whitespace-normal", CARD_FULL_CELL_CLASS)}>
                  {emptyState && totalCount === 0 ? (
                    emptyState
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">No jobs match.</p>
                      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearFilters}>
                        Clear filters
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((job) => {
                const expired = !job.active;
                const applied = appliedIds.has(job.id);
                return (
                  <TableRow key={job.id} className={cn(expired ? EXPIRED_ROW_CLASS : ROW_CLASS, CARD_GRID_CLASS)}>
                    <DataCell className="py-3 pl-4 md:max-w-72 max-md:col-start-1 max-md:row-start-1">
                      {job.url ? (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "block font-medium hover:underline md:truncate",
                            expired ? "text-muted-foreground" : "text-foreground",
                          )}
                        >
                          {job.title}
                        </a>
                      ) : (
                        <span className="block font-medium md:truncate">{job.title}</span>
                      )}
                    </DataCell>
                    <DataCell className="py-3 text-muted-foreground md:max-w-48 md:truncate max-md:hidden">
                      {job.locationRaw ?? "—"}
                    </DataCell>
                    <DataCell className="py-3 text-muted-foreground md:max-w-56 md:truncate max-md:col-start-1 max-md:row-start-3">
                      {job.companyName}
                    </DataCell>
                    <DataCell className="py-3 text-muted-foreground max-md:hidden">
                      {sourceLabel(job.source)}
                    </DataCell>
                    <DataCell className="py-3 max-md:hidden">
                      <PostedCell job={job} now={now} />
                    </DataCell>
                    <DataCell className="py-3 max-md:col-start-1 max-md:row-start-2">
                      <WorkModeBadge workMode={job.workMode} />
                    </DataCell>
                    {showApplied && (
                      <DataCell className="py-3 max-md:col-start-2 max-md:row-start-3 max-md:justify-end">
                        {/* A taken-down job can't be applied to any more, so "Expired" takes the
                            checkbox's place — unless it was already applied to, which stays visible.
                            On a card the checkbox is the rightmost thing, and its 6px of right padding
                            put its center on the heart's and the eye's (28px buttons around a 16px
                            icon) so the three controls line up in one vertical. */}
                        <div
                          className={cn(
                            "flex items-center gap-2 max-md:flex-row-reverse",
                            (!expired || applied) && "max-md:pr-1.5",
                          )}
                        >
                          {(!expired || applied) && (
                            <AppliedCheckbox
                              jobTitle={job.title}
                              applied={applied}
                              pending={pendingAppliedId === job.id}
                              error={appliedErrors[job.id] ?? null}
                              onRequestApply={() => onRequestApply(job)}
                            />
                          )}
                          {expired && <Badge variant="outline">Expired</Badge>}
                        </div>
                      </DataCell>
                    )}
                    {showSaved && (
                      <DataCell className="py-3 max-md:col-start-2 max-md:row-start-2 max-md:justify-end">
                        <SaveJobButton
                          jobTitle={job.title}
                          saved={savedIds.has(job.id)}
                          pending={pendingSavedIds.has(job.id)}
                          error={savedErrors[job.id] ?? null}
                          onToggle={() => onToggleSaved(job, !savedIds.has(job.id))}
                        />
                      </DataCell>
                    )}
                    <DataCell className="py-3 pr-4 max-md:col-start-2 max-md:row-start-1 max-md:justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onViewJob(job)}
                        aria-label={`View description for ${job.title}`}
                      >
                        <EyeIcon className="size-4" />
                      </Button>
                    </DataCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Pager page={page} pageCount={pageCount} onPageChange={onPageChange} className={cn(scrollable && "md:shrink-0 md:pt-3")} />
    </div>
  );
}
