"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { sourceLabel, type JobListItem } from "@/lib/jobs/types";
import type { DescriptionStatus } from "./filter-rule";

type JobDescriptionSheetProps = {
  // Open while non-null. The explorer renders one of these for the whole table, not one per row.
  job: JobListItem | null;
  description: string | undefined;
  status: DescriptionStatus;
  onClose: () => void;
  onRetry: () => void;
};

// Opens by pushing a synthetic history entry, so the phone's back button (and the browser's)
// closes the sheet instead of leaving the dashboard — same URL, just one more stack entry.
// Closing any other way (✕, Escape, outside click) pops that entry again with history.back(),
// so the stack doesn't end up with a stale entry that silently eats the next back press.
function useCloseOnBack(open: boolean, onClose: () => void) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (open && !pushedRef.current) {
      window.history.pushState({ jobDescription: true }, "");
      pushedRef.current = true;
    } else if (!open && pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    }
  }, [open]);

  useEffect(() => {
    function handlePopState() {
      if (!pushedRef.current) return;
      pushedRef.current = false;
      onClose();
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onClose]);
}

// A read-only panel for one job's description, opened from the table's Actions column. See
// apply-confirm-dialog.tsx for the sibling pattern (one instance per table, keyed off `job`).
export function JobDescriptionSheet({ job, description, status, onClose, onRetry }: JobDescriptionSheetProps) {
  const open = job !== null;
  useCloseOnBack(open, onClose);

  // Keeps the text on screen while the sheet slides out, after `job` has already gone back to
  // null (adjusting state during render, as in jobs-explorer.tsx).
  const [shown, setShown] = useState(job);
  if (job && job !== shown) setShown(job);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle className="pr-8">{shown?.title}</SheetTitle>
          <SheetDescription>
            {shown?.companyName}
            {shown && ` · ${sourceLabel(shown.source)}`}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {status === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading description…
            </div>
          ) : status === "error" ? (
            <div className="flex flex-col items-start gap-2 text-sm">
              <p className="text-destructive">Couldn&apos;t load the description.</p>
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Retry
              </Button>
            </div>
          ) : description ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">{description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No description available.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
