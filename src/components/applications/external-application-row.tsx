import { StatusSelect } from "@/components/applications/status-select";
import { RemoveExternalButton } from "@/components/applications/remove-external-button";
import { DataCell, ROW_CLASS } from "@/components/jobs/table-parts";
import { TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ApplicationStatus, ExternalApplicationItem } from "@/lib/applications/types";
import { cvUrl } from "@/lib/cvs/types";
import { EXTERNAL_SOURCE_LABELS } from "@/lib/external-jobs/sources";
import { formatAbsolute } from "@/lib/jobs/format";

// Explicit so the day doesn't depend on whether the server or the browser formats it.
const TIME_ZONE = "Europe/Belgrade";

// A job the candidate added from LinkedIn, HelloWorld or Infostud with the browser extension
// (features/chrome-extension.md): the same four cells as the others. The title opens the job on its
// own site, the company is followed by where it was found, and the CV it names opens in a new tab. The
// status is a dropdown the candidate changes, as for a job tracked by hand, and the row can be removed,
// which the others can't.
export function ExternalApplicationRow({
  item,
  status,
  error,
  pending,
  onStatusChange,
  onRemove,
}: {
  item: ExternalApplicationItem;
  // The table's optimistic status, which is the item's own until one is changed.
  status: ApplicationStatus;
  error?: string;
  pending: boolean;
  onStatusChange: (next: ApplicationStatus) => void;
  onRemove: () => void;
}) {
  const sourceLabel = EXTERNAL_SOURCE_LABELS[item.source];
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
    <TableRow className={ROW_CLASS}>
      <DataCell className="py-3 pl-4 md:max-w-96">
        <div className="grid min-w-0 gap-0.5">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block font-medium text-foreground hover:underline md:truncate"
          >
            {item.title}
          </a>
          {item.cvId && item.cvFileName && (
            <a
              href={cvUrl(item.cvId)}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-muted-foreground hover:underline md:truncate"
            >
              CV: {item.cvFileName}
            </a>
          )}
        </div>
      </DataCell>
      <DataCell className="py-3 text-muted-foreground md:max-w-56">
        <div className="grid min-w-0 gap-0.5">
          <span className="md:truncate">{item.companyName}</span>
          <span className="text-xs">via {sourceLabel}</span>
        </div>
      </DataCell>
      <DataCell className="py-3 whitespace-nowrap">{formatAbsolute(item.appliedAt, TIME_ZONE)}</DataCell>
      <DataCell className="py-3 pr-4">
        <div className="flex items-center gap-1">
          {error ? (
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>{select}</TooltipTrigger>
              <TooltipContent>{error}</TooltipContent>
            </Tooltip>
          ) : (
            select
          )}
          <RemoveExternalButton
            jobTitle={item.title}
            companyName={item.companyName}
            sourceLabel={sourceLabel}
            disabled={pending}
            onConfirm={onRemove}
          />
        </div>
      </DataCell>
    </TableRow>
  );
}
