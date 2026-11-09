import { ZapIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Marks a job posted on Callback (features/companies.md): applying to it is tracked for the
// candidate, unlike a scraped job, whose status they update themselves. On the job board and, for an
// application to such a job, in the candidate's own table (features/callback-applications-in-table.md).
export function AutoTrackedBadge() {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="shrink-0" />}>
        {/* Dark, not the default lime: lime on the row's lime tint would barely show. */}
        <Badge className="bg-foreground text-background">
          <ZapIcon data-icon="inline-start" /> Auto-tracked
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Posted on Callback. Your application status updates automatically.</TooltipContent>
    </Tooltip>
  );
}
