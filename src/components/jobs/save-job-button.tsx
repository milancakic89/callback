"use client";

import { HeartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";

type SaveJobButtonProps = {
  jobTitle: string;
  saved: boolean;
  pending?: boolean;
  error?: string | null;
  onToggle: () => void;
};

// A heart that behaves like a checkbox: filled when the job is saved, outlined when it isn't.
// Controlled by the explorer, which flips it optimistically and reverts it if the Server Action
// fails — see features/saved-jobs.md.
export function SaveJobButton({ jobTitle, saved, pending, error, onToggle }: SaveJobButtonProps) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={saved ? `Remove "${jobTitle}" from saved jobs` : `Save "${jobTitle}"`}
      className={cn(error && "ring-1 ring-destructive")}
    >
      <HeartIcon
        className={cn("size-4", saved ? "fill-rose-500 text-rose-500" : "text-muted-foreground")}
      />
    </Button>
  );

  if (!error) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{button}</TooltipTrigger>
      <TooltipContent>{error}</TooltipContent>
    </Tooltip>
  );
}
