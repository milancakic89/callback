"use client";

import { cn } from "cn";
import { Kbd } from "@/components/landing/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sameChoice, stageChoiceKey, type PipelineStage, type StageChoice, type StageOption } from "@/lib/review/stages";

// The status of an applicant on the review screen (features/candidate-steps.md): one button per status
// (Applied, the company's steps, Offer, Rejected), each with its key. Choosing one is saved at once but
// only the employer sees it until "Apply statuses".

// Past this many, the bar at the bottom of a phone screen would be a wall of buttons: it is a select there.
export const COMPACT_BUTTON_LIMIT = 6;

const DOT_CLASS: Record<PipelineStage, string> = {
  APPLIED: "bg-(--l-fg-subtle)",
  STEP: "bg-(--l-lime)",
  OFFER: "bg-(--l-lime)",
  REJECTED: "bg-red-400",
};

export function StageDot({ stage }: { stage: PipelineStage }) {
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[stage])} />;
}

export function StageControl({
  options,
  stage,
  onChange,
  compact = false,
}: {
  options: readonly StageOption[];
  stage: StageChoice;
  onChange: (choice: StageChoice) => void;
  // The bar at the bottom of a phone screen, which has no keys to show.
  compact?: boolean;
}) {
  if (compact && options.length > COMPACT_BUTTON_LIMIT) {
    return <StageSelect options={options} stage={stage} onChange={onChange} />;
  }

  return (
    <div
      role="group"
      aria-label="Status"
      className={cn(
        "grid gap-1",
        compact ? "grid-cols-3" : "grid-cols-2",
        // Up to 13 buttons: past the first few rows the control scrolls instead of pushing Next off screen.
        !compact && options.length > 8 && "l-scroll max-h-44 overflow-y-auto",
      )}
    >
      {options.map((option) => {
        const chosen = sameChoice(option.choice, stage);
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={chosen}
            title={option.label}
            onClick={() => onChange(option.choice)}
            className={cn(
              "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium transition-colors",
              !chosen &&
                "border-(--l-line) bg-white/[0.02] text-(--l-fg-muted) hover:bg-white/[0.06] hover:text-(--l-fg)",
              chosen &&
                (option.choice.stage === "REJECTED"
                  ? "border-red-400/40 bg-red-400/[0.12] text-(--l-fg)"
                  : "border-(--l-lime)/40 bg-(--l-lime)/[0.12] text-(--l-fg)"),
            )}
          >
            <StageDot stage={option.choice.stage} />
            <span className="truncate">{option.label}</span>
            {!compact && (
              <span className="ml-auto">
                <Kbd>{option.shortcut}</Kbd>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function StageSelect({
  options,
  stage,
  onChange,
}: {
  options: readonly StageOption[];
  stage: StageChoice;
  onChange: (choice: StageChoice) => void;
}) {
  const labelFor = (key: string) => options.find((option) => option.key === key)?.label ?? "Status";

  return (
    <Select
      value={stageChoiceKey(stage)}
      onValueChange={(key) => {
        const option = options.find((candidate) => candidate.key === key);
        if (option) onChange(option.choice);
      }}
    >
      <SelectTrigger
        aria-label="Status"
        className="w-full border-(--l-line) bg-white/[0.03] text-[13px] font-medium text-(--l-fg)"
      >
        <SelectValue>{(value: string) => labelFor(value)}</SelectValue>
      </SelectTrigger>
      {/* It opens outside the review's frame, so it brings the frame's tokens along, as the sheet does. */}
      <SelectContent data-landing className="dark">
        {options.map((option) => (
          <SelectItem key={option.key} value={option.key} className="text-[13px]">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
