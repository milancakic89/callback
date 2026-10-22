"use client";

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { AppliedCheckbox } from "./applied-checkbox";
import { WorkModeBadge } from "./work-mode-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SortDirection, SortField } from "@/lib/jobs/filter";
import { formatAbsolute, formatRelative } from "@/lib/jobs/format";
import type { JobListItem } from "@/lib/jobs/types";
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
  // Optional so the static Suspense fallback (jobs-explorer-fallback.tsx) can render this table
  // with no interactivity at all, without passing functions across a server/client boundary.
  onSortChange?: (field: SortField) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onToggleApplied?: (jobId: string, next: boolean) => void;
  onClearFilters?: () => void;
};

function noop() {}

const PAGE_SIZES = [25, 50, 100];

// A solid colored header band + zebra-striped rows (public/table-example.jpg), instead of the
// shadcn default of a bottom border per row. HEADER_CLASS lives here once and is reused by every
// header cell below, so the band reads as one piece rather than per-cell fills.
// The outer card (overflow-hidden + rounded-2xl, below) clips this to rounded top corners — no
// per-cell rounding needed here.
const HEADER_CLASS = "border-none bg-indigo-600 text-white dark:bg-indigo-700";
const ROW_CLASS = "border-none odd:bg-card even:bg-muted/40";

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDownIcon className="size-3.5 text-white/50" />;
  return direction === "asc" ? <ArrowUpIcon className="size-3.5" /> : <ArrowDownIcon className="size-3.5" />;
}

function SortableHead({
  field,
  label,
  sort,
  direction,
  onSortChange,
  className,
}: {
  field: SortField;
  label: string;
  sort: SortField;
  direction: SortDirection;
  onSortChange: (field: SortField) => void;
  className?: string;
}) {
  return (
    <TableHead className={cn(HEADER_CLASS, className)}>
      <button
        type="button"
        onClick={() => onSortChange(field)}
        className="inline-flex items-center gap-1 font-semibold text-white hover:text-white/80"
      >
        {label}
        <SortIcon active={sort === field} direction={direction} />
      </button>
    </TableHead>
  );
}

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
  onSortChange = noop,
  onPageChange = noop,
  onPageSizeChange = noop,
  onToggleApplied = noop,
  onClearFilters = noop,
}: JobsTableProps) {
  const from = matchCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, matchCount);

  return (
    <div className="flex flex-col gap-3 overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
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
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Rows per page
          <Select value={String(pageSize)} onValueChange={(value) => value && onPageSizeChange(Number(value))}>
            <SelectTrigger size="sm" className="w-18 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        {/* Overrides the shared TableHeader's default row border — the colored band has no need for one. */}
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            <SortableHead
              field="title"
              label="Label"
              sort={sort}
              direction={direction}
              onSortChange={onSortChange}
              className="py-3 pl-4"
            />
            <SortableHead
              field="company"
              label="Company"
              sort={sort}
              direction={direction}
              onSortChange={onSortChange}
              className="py-3"
            />
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
            {showApplied && <TableHead className={cn(HEADER_CLASS, "py-3 pr-4")}>Applied</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 8 }).map((_, index) => (
              <TableRow key={index} className={cn(ROW_CLASS, "hover:bg-transparent")}>
                <TableCell colSpan={showApplied ? 5 : 4} className="px-4 py-3">
                  <Skeleton className="h-5 w-full max-w-md" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className={cn(ROW_CLASS, "hover:bg-transparent")}>
              <TableCell colSpan={showApplied ? 5 : 4} className="px-4 py-10 text-center whitespace-normal">
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
                <TableCell className="max-w-56 truncate py-3 text-muted-foreground">{job.companyName}</TableCell>
                <TableCell className="py-3">
                  <PostedCell job={job} now={now} />
                </TableCell>
                <TableCell className="py-3">
                  <WorkModeBadge workMode={job.workMode} />
                </TableCell>
                {showApplied && (
                  <TableCell className="py-3 pr-4">
                    <AppliedCheckbox
                      jobTitle={job.title}
                      applied={appliedIds.has(job.id)}
                      pending={pendingAppliedId === job.id}
                      error={appliedErrors[job.id] ?? null}
                      onChange={(next) => onToggleApplied(job.id, next)}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end gap-2 px-4 pb-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeftIcon /> Previous
        </Button>
        <span className={cn("px-1 text-sm text-muted-foreground", pageCount === 0 && "invisible")}>
          Page {page} of {Math.max(pageCount, 1)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
