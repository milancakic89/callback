"use client";

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableHead } from "@/components/ui/table";
import type { SortDirection } from "@/lib/jobs/filter";
import { cn } from "cn";

// Shared by the dashboard's jobs table and the applications table, so both look the same.

// A solid colored header band + zebra-striped rows (public/table-example.jpg), instead of the
// shadcn default of a bottom border per row. HEADER_CLASS lives here once and is reused by every
// header cell, so the band reads as one piece rather than per-cell fills.
// The outer card (overflow-hidden + rounded-2xl) clips this to rounded top corners — no
// per-cell rounding needed.
export const HEADER_CLASS = "border-none bg-foreground text-background";

// Below `md` the table becomes a stack of cards, one per row — CSS only, no second markup. The
// table, body, rows and cells stop being table boxes and the header band is hidden along with the
// column names (MobileSort stands in for its sort buttons). By default each cell is a line of its
// own; the jobs table lays its cells out on a grid instead (see CARD_GRID_CLASS there). The zebra
// stripes only make sense for table rows, so the cards get a plain background and a ring instead.
// The card's horizontal padding lives on the row, so cells have none of their own.
export const CARD_TABLE_CLASS = "max-md:block";
export const CARD_HEADER_CLASS = "max-md:hidden";
export const CARD_BODY_CLASS = "max-md:flex max-md:flex-col max-md:gap-3 max-md:p-3";
const CARD_ROW_CLASS = "max-md:block max-md:rounded-xl max-md:px-4 max-md:py-1 max-md:ring-1 max-md:ring-foreground/10";
// For the one-cell rows (skeleton, empty state), which span the whole table on desktop.
export const CARD_FULL_CELL_CLASS = "max-md:block max-md:px-0";

export const ROW_CLASS = cn("border-none md:odd:bg-card md:even:bg-muted/40 max-md:bg-card", CARD_ROW_CLASS);
// A job the scraper has taken down stays listed with a gray row. Plain `bg-muted` is darker than
// the zebra stripe's `bg-muted/40`, so it reads as a different kind of row.
export const EXPIRED_ROW_CLASS = cn("border-none bg-muted text-muted-foreground", CARD_ROW_CLASS);

export const PAGE_SIZES = [20, 50, 100];

// A table cell that, on a card (see above), is a full-width line with its value on the left. Cells
// holding a control (checkbox, heart, …) add `max-md:justify-end` to sit on the right instead.
export function DataCell({ className, ...props }: ComponentProps<typeof TableCell>) {
  return (
    <TableCell
      className={cn(
        "max-md:flex max-md:items-center max-md:gap-4 max-md:px-0 max-md:py-1.5 max-md:text-left max-md:whitespace-normal max-md:wrap-anywhere",
        className,
      )}
      {...props}
    />
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDownIcon className="size-3.5 text-background/50" />;
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
        className="inline-flex items-center gap-1 font-semibold text-background hover:text-background/80"
      >
        {label}
        <SortIcon active={sort === field} direction={direction} />
      </button>
    </TableHead>
  );
}

// The header band's sort buttons are hidden on cards, so this stands in for them: a field picker
// plus a button flipping the direction. Shown below `md` only.
export function MobileSort<Field extends string>({
  options,
  sort,
  direction,
  onSortChange,
}: {
  options: { field: Field; label: string }[];
  sort: Field;
  direction: SortDirection;
  onSortChange: (field: Field) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground md:hidden">
      Sort by
      <Select value={sort} onValueChange={(next) => next && next !== sort && onSortChange(next as Field)}>
        <SelectTrigger size="sm" className="w-28 bg-card">
          {/* Base UI shows the raw value unless told how to render it. */}
          <SelectValue>{(value: string) => options.find((option) => option.field === value)?.label ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.field} value={option.field}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="bg-card"
        onClick={() => onSortChange(sort)}
        aria-label={direction === "asc" ? "Ascending — switch to descending" : "Descending — switch to ascending"}
      >
        {direction === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
      </Button>
    </div>
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
    <div className={cn("flex items-center justify-between gap-2 px-4 pb-4 md:justify-end", className)}>
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
