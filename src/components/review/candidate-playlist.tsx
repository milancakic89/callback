"use client";

import { CheckIcon, HeartIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "cn";
import { Initials } from "@/components/landing/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { matchesPlaylist, type PlaylistFilter, type StageFilter } from "@/lib/review/navigation";
import type { PlaylistOrder } from "@/lib/review/order";
import { HIRING_STAGE_LABELS, HIRING_STAGES, type HiringStage } from "@/lib/review/stages";
import { StageDot } from "./ats-panel";

// The applicants of the job as a playlist (features/applicant-review.md): who is open now, who has
// been viewed (Next marks them), their status (features/application-status.md), who was liked, and
// how many required filters each one's CV meets (features/cv-screening.md). Any row opens that
// applicant, and Next carries on from there. All / Liked and the status select narrow the list
// together, and the order is either the order the applications came in or the best keyword match first.

export type PlaylistItem = {
  id: string;
  name: string;
  location: string | null;
  viewed: boolean;
  liked: boolean;
  stage: HiringStage;
  // "3/4" or null when there is nothing to show (no required filters, or not checked yet). `unverified`
  // counts the required filters a keyword can't decide, which the reviewer reads the CV for.
  requiredScore: { met: number; total: number; unverified: number } | null;
};

function StageFilterLabel({ value, count }: { value: StageFilter; count: number }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      {value !== "any" && <StageDot stage={value} />}
      <span className="truncate">{value === "any" ? "Any status" : HIRING_STAGE_LABELS[value]}</span>
      <span className="ml-auto font-mono text-[11px] text-(--l-fg-subtle) tabular-nums">{count}</span>
    </span>
  );
}

export function CandidatePlaylist({
  items,
  currentId,
  filter,
  onFilter,
  stageFilter,
  onStageFilter,
  order,
  onOrder,
  onSelect,
}: {
  items: PlaylistItem[];
  currentId: string;
  filter: PlaylistFilter;
  onFilter: (filter: PlaylistFilter) => void;
  stageFilter: StageFilter;
  onStageFilter: (filter: StageFilter) => void;
  // Null when the job has no filters, so there is nothing to order by.
  order: PlaylistOrder | null;
  onOrder: (order: PlaylistOrder) => void;
  onSelect: (id: string) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const shown = items.filter((item) => matchesPlaylist(item, filter, stageFilter));
  // How many each choice would show, given the other control's choice.
  const filterCount = (value: PlaylistFilter) =>
    items.filter((item) => matchesPlaylist(item, value, stageFilter)).length;
  const stageCount = (value: StageFilter) => items.filter((item) => matchesPlaylist(item, filter, value)).length;

  // The open applicant stays in view as Next moves down a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-id="${currentId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentId, filter, stageFilter]);

  return (
    <nav aria-label="Candidates" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3 pb-2">
        <p className="text-[12px] font-medium text-(--l-fg-muted)">
          Candidates <span className="font-mono text-(--l-fg-subtle) tabular-nums">{items.length}</span>
        </p>
      </div>
      <div className="mx-3 mb-2 flex shrink-0 gap-1 rounded-lg bg-white/[0.03] p-0.5" role="group" aria-label="Show">
        {(["all", "liked"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => onFilter(value)}
            className={cn(
              "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-colors",
              filter === value ? "bg-white/[0.08] text-(--l-fg)" : "text-(--l-fg-subtle) hover:text-(--l-fg-muted)",
            )}
          >
            {value === "all" ? "All" : <><HeartIcon aria-hidden className="size-3" /> Liked</>}
            <span className="font-mono text-[11px] text-(--l-fg-subtle) tabular-nums">{filterCount(value)}</span>
          </button>
        ))}
      </div>
      {order !== null && (
        <div className="mx-3 mb-2 flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-(--l-fg-subtle)">Order</span>
          <div className="flex flex-1 gap-1 rounded-lg bg-white/[0.03] p-0.5" role="group" aria-label="Order">
            {(
              [
                ["applied", "Applied"],
                ["match", "Best match"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={order === value}
                onClick={() => onOrder(value)}
                className={cn(
                  "inline-flex h-6 flex-1 items-center justify-center rounded-md text-[11.5px] font-medium transition-colors",
                  order === value ? "bg-white/[0.08] text-(--l-fg)" : "text-(--l-fg-subtle) hover:text-(--l-fg-muted)",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mx-3 mb-2 shrink-0">
        <Select value={stageFilter} onValueChange={(value) => value && onStageFilter(value as StageFilter)}>
          <SelectTrigger
            size="sm"
            aria-label="Filter by status"
            className="w-full border-(--l-line) bg-white/[0.03] text-[12px] font-medium text-(--l-fg-muted)"
          >
            <SelectValue>
              {(value: StageFilter) => <StageFilterLabel value={value} count={stageCount(value)} />}
            </SelectValue>
          </SelectTrigger>
          {/* It opens outside the review's frame, so it brings the frame's tokens along, as the sheet does. */}
          <SelectContent data-landing className="dark">
            {(["any", ...HIRING_STAGES] as const).map((value) => (
              <SelectItem key={value} value={value} className="text-[12px]">
                <StageFilterLabel value={value} count={stageCount(value)} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-6 text-[12px] leading-relaxed text-(--l-fg-subtle)">
          {stageFilter === "any"
            ? "No liked candidates yet. The heart next to Next keeps the ones you want to come back to."
            : "No candidates with this status."}
        </p>
      ) : (
        <ol ref={listRef} className="l-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
          {shown.map((item) => {
            const current = item.id === currentId;
            const allMet = item.requiredScore !== null && item.requiredScore.met === item.requiredScore.total;
            const rejected = item.stage === "REJECTED";
            return (
              <li key={item.id} data-id={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    current ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                  )}
                >
                  {current && (
                    <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-(--l-lime)" />
                  )}
                  <span className="relative">
                    <Initials
                      name={item.name}
                      className={cn(item.viewed && !current && "opacity-60", rejected && !current && "opacity-40")}
                    />
                    {!item.viewed && (
                      <span
                        aria-hidden
                        className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-(--l-lime) ring-2 ring-(--l-surface)"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[13px] font-medium",
                        rejected && !current
                          ? "text-(--l-fg-subtle)"
                          : item.viewed && !current
                            ? "text-(--l-fg-muted)"
                            : "text-(--l-fg)",
                      )}
                    >
                      {item.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-(--l-fg-subtle)">
                      {item.stage !== "APPLIED" ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-(--l-fg-muted)">
                          <StageDot stage={item.stage} /> {HIRING_STAGE_LABELS[item.stage]}
                        </span>
                      ) : item.viewed ? (
                        <span className="inline-flex shrink-0 items-center gap-0.5">
                          <CheckIcon aria-hidden className="size-3" /> Viewed
                        </span>
                      ) : (
                        <span className="shrink-0 text-(--l-lime)/80">New</span>
                      )}
                      {item.location && <span className="truncate">· {item.location}</span>}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {item.liked ? (
                      <HeartIcon aria-label="Liked" className="size-3.5 fill-(--l-lime) text-(--l-lime)" />
                    ) : (
                      <span className="size-3.5" />
                    )}
                    {item.requiredScore && (
                      <span
                        title={
                          item.requiredScore.unverified > 0
                            ? `Required filters met, by keywords (${item.requiredScore.unverified} to check by eye)`
                            : "Required filters met, by keywords"
                        }
                        className={cn(
                          "font-mono text-[10.5px] tabular-nums",
                          allMet ? "text-(--l-lime)" : "text-(--l-fg-subtle)",
                        )}
                      >
                        {item.requiredScore.met}/{item.requiredScore.total}
                        {item.requiredScore.unverified > 0 && <span aria-hidden>?</span>}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
}
