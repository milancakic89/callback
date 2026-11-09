"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { setApplicationStatus } from "@/app/(app)/applications/actions";
import { CallbackApplicationRow, ManualApplicationRow } from "./application-rows";
import {
  CARD_BODY_CLASS,
  CARD_FULL_CELL_CLASS,
  CARD_HEADER_CLASS,
  CARD_TABLE_CLASS,
  HEADER_CLASS,
  MobileSort,
  PageSizeSelect,
  Pager,
  ROW_CLASS,
  SortableHead,
} from "@/components/jobs/table-parts";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compareApplications, itemKey, type SortField } from "@/lib/applications/list";
import type { ApplicationListItem, ApplicationStatus, ManualApplicationItem } from "@/lib/applications/types";
import type { SortDirection } from "@/lib/jobs/filter";
import { cn } from "cn";

const DEFAULT_PAGE_SIZE = 20;
// The sortable columns, for the sort picker that stands in for the header band on cards.
const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "title", label: "Label" },
  { field: "company", label: "Company" },
  { field: "applied", label: "Applied" },
  { field: "status", label: "Status" },
];

// Owns sort, paging and the optimistic status state of the rows tracked by hand. A status change is
// saved immediately by the Server Action, and reverted with an error tooltip if that fails — see
// features/applied.md. The applications to jobs posted on Callback are rows of the same table, with an
// automatic status (features/callback-applications-in-table.md).
export function ApplicationsTable({ items }: { items: ApplicationListItem[] }) {
  const [sort, setSort] = useState<SortField>("applied");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [statuses, setStatuses] = useState<Record<string, ApplicationStatus>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sorted = useMemo(() => {
    const result = [...items].sort((first, second) => compareApplications(first, second, sort));
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

  async function handleStatusChange(item: ManualApplicationItem, next: ApplicationStatus) {
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
    <div className="flex flex-col gap-3 overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10 md:h-full md:min-h-0 md:gap-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 md:shrink-0 md:pb-3">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{from}–{to}</span> of{" "}
          <span className="font-medium text-foreground">{sorted.length}</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <MobileSort options={SORT_OPTIONS} sort={sort} direction={direction} onSortChange={handleSortChange} />
          <PageSizeSelect
            value={pageSize}
            onChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* One scroll container with a sticky header — see the long note in jobs-table.tsx. Below
          `md` the rows are cards and the page scrolls instead. */}
      <div className="md:min-h-0 md:flex-1 md:overflow-auto">
        <Table className={CARD_TABLE_CLASS} containerClassName="relative w-full overflow-x-visible">
          <TableHeader className={cn("sticky top-0 z-10 [&_tr]:border-b-0", CARD_HEADER_CLASS)}>
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
          <TableBody className={CARD_BODY_CLASS}>
            {items.length === 0 ? (
              <TableRow className={cn(ROW_CLASS, "hover:bg-transparent")}>
                <TableCell colSpan={4} className={cn("px-4 py-10 text-center whitespace-normal", CARD_FULL_CELL_CLASS)}>
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
              rows.map((item) =>
                item.kind === "callback" ? (
                  <CallbackApplicationRow key={itemKey(item)} item={item} />
                ) : (
                  <ManualApplicationRow
                    key={itemKey(item)}
                    item={item}
                    status={statuses[item.jobId] ?? item.status}
                    error={errors[item.jobId]}
                    pending={pendingId === item.jobId}
                    onStatusChange={(next) => handleStatusChange(item, next)}
                  />
                ),
              )
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
    <div className="flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10 md:h-full md:min-h-0">
      <div className="px-4 pt-4 pb-3 text-sm text-muted-foreground">Loading…</div>
      <Table className={CARD_TABLE_CLASS}>
        <TableHeader className={cn("[&_tr]:border-b-0", CARD_HEADER_CLASS)}>
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
