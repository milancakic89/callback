"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

type AppliedCheckboxProps = {
  jobTitle: string;
  applied: boolean;
  pending?: boolean;
  error?: string | null;
  onChange: (next: boolean) => void;
};

// Controlled by the explorer's `useAppliedJobs` hook, which does the optimistic update and the
// Server Action call — see features/dashboard.md "Applied Server Action".
export function AppliedCheckbox({ jobTitle, applied, pending, error, onChange }: AppliedCheckboxProps) {
  const checkbox = (
    <Checkbox
      checked={applied}
      disabled={pending}
      onCheckedChange={(checked) => onChange(checked === true)}
      aria-label={applied ? `Mark "${jobTitle}" as not applied` : `Mark "${jobTitle}" as applied`}
      className={cn(error && "border-destructive")}
    />
  );

  if (!error) return checkbox;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{checkbox}</TooltipTrigger>
      <TooltipContent>{error}</TooltipContent>
    </Tooltip>
  );
}
