import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAbsolute, formatRelative } from "@/lib/jobs/format";
import { jobDate, type JobListItem } from "@/lib/jobs/types";

// On a card (below `md`) there is no column header to say what a bare "3 days ago" means, so the
// date is led by this word. From `md` up it is display:none and the cell is just the date. It sits
// in the same inline element as the date, because the card's cells are flex rows with a gap: two
// siblings would end up 16px apart.
function PostedWord() {
  return <span className="md:hidden">Posted </span>;
}

// The Posted column of the jobs table: "Posted 3 days ago" on a card, "3 days ago" in the column.
export function PostedCell({ job, now }: { job: JobListItem; now?: number }): ReactNode {
  // No live clock during a prerender (the static Suspense fallback has no `now`) — an absolute
  // date is deterministic, "3d ago" isn't.
  if (now === undefined) {
    return (
      <span>
        <PostedWord />
        {formatAbsolute(jobDate(job))}
      </span>
    );
  }
  if (job.postedAt) {
    return (
      <span>
        <PostedWord />
        {formatRelative(job.postedAt, now)}
      </span>
    );
  }
  // The scraper's own date, when the source gave none: muted, and the tooltip says what it is.
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="text-muted-foreground" />}>
        <PostedWord />
        {formatRelative(job.firstSeenAt, now)}
      </TooltipTrigger>
      <TooltipContent>First seen {formatAbsolute(job.firstSeenAt)}</TooltipContent>
    </Tooltip>
  );
}
