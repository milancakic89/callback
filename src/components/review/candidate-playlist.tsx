"use client";

import { CheckIcon, HeartIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "cn";
import { Initials } from "@/components/landing/ui";

// The applicants of the job as a playlist (features/applicant-review.md): who is open now, who has
// been viewed (Next marks them), who was liked, and how many required filters each one's CV meets.
// Any row opens that applicant, and Next carries on from there. All / Liked narrows the list.

export type PlaylistItem = {
  id: string;
  name: string;
  location: string | null;
  viewed: boolean;
  liked: boolean;
  // "3/4" or null when there is nothing to show (no required filters, or not checked yet).
  requiredScore: { met: number; total: number } | null;
};

export type PlaylistFilter = "all" | "liked";

export function CandidatePlaylist({
  items,
  currentId,
  filter,
  onFilter,
  onSelect,
}: {
  items: PlaylistItem[];
  currentId: string;
  filter: PlaylistFilter;
  onFilter: (filter: PlaylistFilter) => void;
  onSelect: (id: string) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const likedCount = items.filter((item) => item.liked).length;
  const shown = filter === "liked" ? items.filter((item) => item.liked) : items;

  // The open applicant stays in view as Next moves down a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-id="${currentId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentId, filter]);

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
            <span className="font-mono text-[11px] text-(--l-fg-subtle) tabular-nums">
              {value === "all" ? items.length : likedCount}
            </span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-6 text-[12px] leading-relaxed text-(--l-fg-subtle)">
          No liked candidates yet. The heart next to Next keeps the ones you want to come back to.
        </p>
      ) : (
        <ol ref={listRef} className="l-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
          {shown.map((item) => {
            const current = item.id === currentId;
            const allMet = item.requiredScore !== null && item.requiredScore.met === item.requiredScore.total;
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
                    <Initials name={item.name} className={cn(item.viewed && !current && "opacity-60")} />
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
                        item.viewed && !current ? "text-(--l-fg-muted)" : "text-(--l-fg)",
                      )}
                    >
                      {item.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-(--l-fg-subtle)">
                      {item.viewed ? (
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
                        title="Required filters met"
                        className={cn(
                          "font-mono text-[10.5px] tabular-nums",
                          allMet ? "text-(--l-lime)" : "text-(--l-fg-subtle)",
                        )}
                      >
                        {item.requiredScore.met}/{item.requiredScore.total}
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
