import { Badge } from "@/components/ui/badge";
import { WORK_MODE_LABELS, type WorkMode } from "@/lib/jobs/types";
import { cn } from "cn";

const STYLES: Record<WorkMode, string> = {
  REMOTE:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  HYBRID:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  ON_SITE:
    "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
};

export function WorkModeBadge({ workMode }: { workMode: WorkMode | null }) {
  if (!workMode) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", STYLES[workMode])}>
      {WORK_MODE_LABELS[workMode]}
    </Badge>
  );
}
