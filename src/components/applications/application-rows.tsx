import Link from "next/link";
import { CandidateStage } from "@/components/applications/candidate-stage";
import { StatusSelect } from "@/components/applications/status-select";
import { AutoTrackedBadge } from "@/components/jobs/auto-tracked-badge";
import { DataCell, EXPIRED_ROW_CLASS, NATIVE_ROW_CLASS, ROW_CLASS } from "@/components/jobs/table-parts";
import { Badge } from "@/components/ui/badge";
import { TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ApplicationStatus, CallbackApplicationItem, ManualApplicationItem } from "@/lib/applications/types";
import { CALLBACK_APPLICATION_STATE_LABELS } from "@/lib/cvs/types";
import { formatAbsolute } from "@/lib/jobs/format";
import { postingPath } from "@/lib/jobs/published";
import { cn } from "cn";

// The two kinds of row in the /applications table. They have the same four cells (Label, Company,
// Applied, Status); what differs is how the job is picked out and who sets the status.

// Explicit so the day doesn't depend on whether the server or the browser formats it.
const TIME_ZONE = "Europe/Belgrade";

// A job the candidate tracks by hand: its status is a dropdown they change, saved at once by the table.
export function ManualApplicationRow({
  item,
  status,
  error,
  pending,
  onStatusChange,
}: {
  item: ManualApplicationItem;
  // The table's optimistic status, which is the item's own until one is changed.
  status: ApplicationStatus;
  error?: string;
  pending: boolean;
  onStatusChange: (next: ApplicationStatus) => void;
}) {
  const select = (
    <StatusSelect
      jobTitle={item.title}
      value={status}
      disabled={pending}
      error={Boolean(error)}
      onChange={onStatusChange}
    />
  );

  return (
    <TableRow className={item.active ? ROW_CLASS : EXPIRED_ROW_CLASS}>
      <DataCell className="py-3 pl-4 md:max-w-96">
        <div className="flex items-center gap-2">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "block font-medium hover:underline md:truncate",
                item.active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {item.title}
            </a>
          ) : (
            <span className="block font-medium md:truncate">{item.title}</span>
          )}
          {!item.active && <Badge variant="outline">Expired</Badge>}
        </div>
      </DataCell>
      <DataCell className="py-3 text-muted-foreground md:max-w-56 md:truncate">{item.companyName}</DataCell>
      <DataCell className="py-3 whitespace-nowrap">{formatAbsolute(item.appliedAt, TIME_ZONE)}</DataCell>
      <DataCell className="py-3 pr-4">
        {error ? (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>{select}</TooltipTrigger>
            <TooltipContent>{error}</TooltipContent>
          </Tooltip>
        ) : (
          select
        )}
      </DataCell>
    </TableRow>
  );
}

// An application to a job posted on Callback (features/callback-applications-in-table.md): picked out
// as on the job board (the lime row, a bold title, the "Auto-tracked" badge), the title opens the job's
// own page, and the status is the one the company applied, with no dropdown. A job that isn't open to
// the application any more (paused, or the application withdrawn) is the gray row an expired job gets,
// with the state beside the title.
export function CallbackApplicationRow({ item }: { item: CallbackApplicationItem }) {
  const open = item.state === "active";

  return (
    <TableRow className={open ? NATIVE_ROW_CLASS : EXPIRED_ROW_CLASS}>
      <DataCell className="py-3 pl-4 md:max-w-96">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={postingPath(item.jobId)}
            className={cn(
              "block min-w-0 font-semibold hover:underline md:truncate",
              open ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {item.title}
          </Link>
          <AutoTrackedBadge />
          {!open && <Badge variant="outline">{CALLBACK_APPLICATION_STATE_LABELS[item.state]}</Badge>}
        </div>
      </DataCell>
      <DataCell className="py-3 text-muted-foreground md:max-w-56 md:truncate">{item.companyName}</DataCell>
      <DataCell className="py-3 whitespace-nowrap">{formatAbsolute(item.appliedAt, TIME_ZONE)}</DataCell>
      <DataCell className="py-3 pr-4">
        {item.status ? <CandidateStage status={item.status} /> : <span className="text-muted-foreground">—</span>}
      </DataCell>
    </TableRow>
  );
}
