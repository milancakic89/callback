import { InfoIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { candidateStatusView } from "@/lib/applications/candidate-status";
import type { CallbackStatus } from "@/lib/cvs/types";
import { formatAbsolute } from "@/lib/jobs/format";
import { cn } from "cn";

// Explicit so the day doesn't depend on whether the server or the browser formats it.
const TIME_ZONE = "Europe/Belgrade";

// The status the company showed the candidate on /applications (features/candidate-steps.md). A step the
// company defined has a text, opened by the info icon in a popover (it works on a tap, which a tooltip
// does not); Applied, Got offer and Rejected have none. When the company edited the step after moving
// the candidate to it, the popover says when.
export function CandidateStage({ status, className }: { status: CallbackStatus; className?: string }) {
  const view = candidateStatusView(status);

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Badge
        className={cn(
          status.stage === "REJECTED"
            ? "bg-red-500/10 text-red-700 dark:text-red-400"
            : status.stage === "APPLIED"
              ? "bg-muted text-foreground"
              : "bg-sky-600/10 text-sky-700 dark:text-sky-400",
        )}
      >
        {view.label}
      </Badge>
      {view.description !== null && (
        <Popover>
          <PopoverTrigger
            aria-label={`About the step ${view.label}`}
            className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <InfoIcon aria-hidden className="size-4" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
            <PopoverTitle>{view.label}</PopoverTitle>
            {/* Plain text, never HTML: it is what the company wrote. */}
            <PopoverDescription className="leading-relaxed whitespace-pre-wrap">{view.description}</PopoverDescription>
            {view.editedAt !== null && (
              <p className="text-xs text-muted-foreground">Updated on {formatAbsolute(view.editedAt, TIME_ZONE)}</p>
            )}
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
