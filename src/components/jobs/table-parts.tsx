"use client";

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableHead } from "@/components/ui/table";
import type { SortDirection } from "@/lib/jobs/filter";
import { cn } from "cn";

// Shared by the dashboard's jobs table and the applications table, so both look the same.

// A solid colored header band + zebra-striped rows (public/table-example.jpg), instead of the
// shadcn default of a bottom border per row. HEADER_CLASS lives here once and is reused by every
// header cell, so the band reads as one piece rather than per-cell fills.
// The outer card (overflow-hidden + rounded-2xl) clips this to rounded top corners — no
// per-cell rounding needed.
export const HEADER_CLASS = "border-none bg-indigo-600 text-white dark:bg-indigo-700";
export const ROW_CLASS = "border-none odd:bg-card even:bg-muted/40";

export const PAGE_SIZES = [25, 50, 100];

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDownIcon className="size-3.5 text-white/50" />;
  return direction === "asc" ? <ArrowUpIcon className="size-3.5" /> : <ArrowDownIcon className="size-3.5" />;
}

export function SortableHead<Field extends string>({
  field,
  label,
  sort,
  direction,
  onSortChange,
  className,
}: {
  field: Field;
  label: string;
  sort: Field;
  direction: SortDirection;
  onSortChange: (field: Field) => void;
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

export function PageSizeSelect({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      Rows per page
      <Select value={String(value)} onValueChange={(next) => next && onChange(Number(next))}>
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
  );
}

export function Pager({
  page,
  pageCount,
  onPageChange,
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-end gap-2 px-4 pb-4", className)}>
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
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
  );
}
