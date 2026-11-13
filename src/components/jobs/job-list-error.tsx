"use client";

import { Button } from "@/components/ui/button";

// Shown above the table when the job list couldn't be loaded (the page itself only carries the first
// rows; see use-job-list.ts).
export function JobListError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
    >
      <p className="text-destructive">Couldn&apos;t load the job list.</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
