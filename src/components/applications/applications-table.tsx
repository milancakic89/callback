"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { setApplicationStatus } from "@/app/(app)/applications/actions";
import { StatusSelect } from "./status-select";
import { HEADER_CLASS, PageSizeSelect, Pager, ROW_CLASS, SortableHead } from "@/components/jobs/table-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  APPLICATION_STATUSES,
  type ApplicationListItem,
  type ApplicationStatus,
} from "@/lib/applications/types";
import type { SortDirection } from "@/lib/jobs/filter";
import { formatAbsolute } from "@/lib/jobs/format";
import { cn } from "cn";

type SortField = "title" | "company" | "applied" | "status";

const DEFAULT_PAGE_SIZE = 50;
// Explicit so the day doesn't depend on whether the server or the browser formats it.
const TIME_ZONE = "Europe/Belgrade";

// A job the scraper has taken down stays listed with a gray row. Plain `bg-muted` is darker than
// the zebra stripe's `bg-muted/40`, so it reads as a different kind of row.
const EXPIRED_ROW_CLASS = "border-none bg-muted text-muted-foreground";

function compare(a: ApplicationListItem, b: ApplicationListItem, field: SortField): number {
  switch (field) {
    case "title":
      return a.title.localeCompare(b.title);
    case "company":
      return a.companyName.localeCompare(b.companyName);
    case "applied":
      return Date.parse(a.appliedAt) - Date.parse(b.appliedAt);
    case "status":
      return APPLICATION_STATUSES.indexOf(a.status) - APPLICATION_STATUSES.indexOf(b.status);
  }
}

// Owns sort, paging and the optimistic status state. A status change is saved immediately by the
// Server Action, and reverted with an error tooltip if that fails — see features/applied.md.
export function ApplicationsTable({ items }: { items: ApplicationListItem[] }) {
  const [sort, setSort] = useState<SortField>("applied");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [statuses, setStatuses] = useState<Record<string, ApplicationStatus>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sorted = useMemo(() => {
    const result = [...items].sort((a, b) => compare(a, b, sort));
    if (direction === "desc") result.reverse();
    return result;
  }, [items, sort, direction]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const rows = sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);
  const from = sorted.length === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const to = Math.min(clampedPage * pageSize, sorted.length);

  function handleSortChange(field: SortField) {
    if (field === sort) {
      setDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDirection(field === "applied" ? "desc" : "asc");
    }
    setPage(1);
  }

  async function handleStatusChange(item: ApplicationListItem, next: ApplicationStatus) {
    const previous = statuses[item.jobId] ?? item.status;
    setErrors((prev) => {
      if (!(item.jobId in prev)) return prev;
      const rest = { ...prev };
      delete rest[item.jobId];
      return rest;
    });
    setStatuses((prev) => ({ ...prev, [item.jobId]: next }));
    setPendingId(item.jobId);

    const result = await setApplicationStatus(item.jobId, next);

    setPendingId(null);
    if (!result.ok) {
      setStatuses((prev) => ({ ...prev, [item.jobId]: previous }));
      setErrors((prev) => ({ ...prev, [item.jobId]: result.error }));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{from}–{to}</span> of{" "}
          <span className="font-medium text-foreground">{sorted.length}</span>
        </p>
        <PageSizeSelect
          value={pageSize}
          onChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      {/* One scroll container with a sticky header — see the long note in jobs-table.tsx. */}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table containerClassName="relative w-full overflow-x-visible">
          <TableHeader className="sticky top-0 z-10 [&_tr]:border-b-0">
            <TableRow className="hover:bg-transparent">
              <SortableHead
                field="title"
                label="Label"
                sort={sort}
                direction={direction}
                onSortChange={handleSortChange}
                className="py-3 pl-4"
              />
              <SortableHead
                field="company"
                label="Company"
                sort={sort}
                direction={direction}
                onSortChange={handleSortChange}
                className="py-3"
              />
              <SortableHead
                field="applied"
                label="Applied"
                sort={sort}
                direction={direction}
                onSortChange={handleSortChange}
                className="py-3"
              />
              <SortableHead
                field="status"
                label="Status"
                sort={sort}
                direction={direction}
                onSortChange={handleSortChange}
                className="py-3 pr-4"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow className={cn(ROW_CLASS, "hover:bg-transparent")}>
                <TableCell colSpan={4} className="px-4 py-10 text-center whitespace-normal">
                  <p className="text-sm text-muted-foreground">You haven&apos;t applied to any jobs yet.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    nativeButton={false}
                    render={<Link href="/dashboard" />}
                  >
                    Browse jobs
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((item) => {
                const status = statuses[item.jobId] ?? item.status;
                const error = errors[item.jobId];
                const select = (
                  <StatusSelect
                    jobTitle={item.title}
                    value={status}
                    disabled={pendingId === item.jobId}
                    error={Boolean(error)}
                    onChange={(next) => handleStatusChange(item, next)}
                  />
                );

                return (
                  <TableRow key={item.jobId} className={item.active ? ROW_CLASS : EXPIRED_ROW_CLASS}>
                    <TableCell className="max-w-96 py-3 pl-4">
                      <div className="flex items-center gap-2">
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "block truncate font-medium hover:text-primary hover:underline",
                              item.active ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {item.title}
                          </a>
                        ) : (
                          <span className="block truncate font-medium">{item.title}</span>
                        )}
                        {!item.active && <Badge variant="outline">Expired</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56 truncate py-3 text-muted-foreground">{item.companyName}</TableCell>
                    <TableCell className="py-3 whitespace-nowrap">{formatAbsolute(item.appliedAt, TIME_ZONE)}</TableCell>
                    <TableCell className="py-3 pr-4">
                      {error ? (
                        <Tooltip>
                          <TooltipTrigger render={<span className="inline-flex" />}>{select}</TooltipTrigger>
                          <TooltipContent>{error}</TooltipContent>
                        </Tooltip>
                      ) : (
                        select
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Pager page={clampedPage} pageCount={pageCount} onPageChange={setPage} className="shrink-0 pt-3" />
    </div>
  );
}

// The static fallback while the user's applications load: the header band and a few skeleton rows.
export function ApplicationsTableFallback() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10">
      <div className="px-4 pt-4 pb-3 text-sm text-muted-foreground">Loading…</div>
      <Table>
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(HEADER_CLASS, "py-3 pl-4")}>Label</TableHead>
            <TableHead className={cn(HEADER_CLASS, "py-3")}>Company</TableHead>
            <TableHead className={cn(HEADER_CLASS, "py-3")}>Applied</TableHead>
            <TableHead className={cn(HEADER_CLASS, "py-3 pr-4")}>Status</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    </div>
  );
}
