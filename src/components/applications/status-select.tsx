"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/lib/applications/types";
import { cn } from "cn";

const DOT_CLASS: Record<ApplicationStatus, string> = {
  PENDING: "bg-muted-foreground/60",
  NO_ANSWER: "bg-amber-500",
  REJECTED: "bg-red-500",
  OFFER: "bg-green-500",
};

function StatusLabel({ status }: { status: ApplicationStatus }) {
  return (
    <>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT_CLASS[status])} />
      {APPLICATION_STATUS_LABELS[status]}
    </>
  );
}

type StatusSelectProps = {
  jobTitle: string;
  value: ApplicationStatus;
  disabled?: boolean;
  error?: boolean;
  onChange: (next: ApplicationStatus) => void;
};

export function StatusSelect({ jobTitle, value, disabled, error, onChange }: StatusSelectProps) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => next && next !== value && onChange(next as ApplicationStatus)}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Status of "${jobTitle}"`}
        aria-invalid={error || undefined}
        className="w-48 bg-card"
      >
        <SelectValue>{(status: ApplicationStatus) => <StatusLabel status={status} />}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {APPLICATION_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            <StatusLabel status={status} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
