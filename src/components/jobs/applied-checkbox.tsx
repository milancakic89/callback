"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

type AppliedCheckboxProps = {
  jobTitle: string;
  applied: boolean;
  pending?: boolean;
  error?: string | null;
  onRequestApply: () => void;
};

// Controlled by the explorer, which keeps it unchecked until the confirm dialog is accepted and
// the Server Action has been called — see features/applied.md. Once applied it is checked and
// disabled for good: there is no way to unapply, here or in the database.
export function AppliedCheckbox({ jobTitle, applied, pending, error, onRequestApply }: AppliedCheckboxProps) {
  const checkbox = (
    <Checkbox
      checked={applied}
      disabled={applied || pending}
      onCheckedChange={(checked) => {
        if (checked === true && !applied) onRequestApply();
      }}
      aria-label={applied ? `Applied to "${jobTitle}"` : `Mark "${jobTitle}" as applied`}
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
