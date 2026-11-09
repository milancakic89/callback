"use client";

import { useRef, useState } from "react";
import { cn } from "cn";
import { ProductShot } from "./product-shot";
import type { ReviewShot } from "./review-shots";

// The Fast Manual Mode section's screenshots (features/landing-screenshots.md), one at a time, with
// a row of tabs to pick which. All of them sit in the same grid cell and the picked one fades in, so
// the box never changes size and a screenshot is already loaded when its tab is clicked. The ones
// not shown are `inert`: out of the tab order and away from a screen reader.
// `shots` come from the parent so this holds no data of its own (and can be shown any list).

export function ReviewScreenshots({ shots }: { shots: ReviewShot[] }) {
  const [activeId, setActiveId] = useState(shots[0].id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = shots.find((shot) => shot.id === activeId) ?? shots[0];

  // Left and Right move between tabs and select the one reached, as the tabs pattern asks.
  function handleKeyDown(event: React.KeyboardEvent) {
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (offset === 0) return;
    event.preventDefault();
    const index = shots.findIndex((shot) => shot.id === activeId);
    const target = shots[(index + offset + shots.length) % shots.length];
    setActiveId(target.id);
    tabRefs.current[target.id]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Fast Manual Mode screenshots"
        onKeyDown={handleKeyDown}
        className="mx-auto mb-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border border-(--l-line) bg-white/[0.03] p-1"
      >
        {shots.map((shot) => {
          const selected = shot.id === activeId;
          return (
            <button
              key={shot.id}
              ref={(element) => {
                tabRefs.current[shot.id] = element;
              }}
              type="button"
              role="tab"
              id={`review-tab-${shot.id}`}
              aria-selected={selected}
              aria-controls={`review-panel-${shot.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(shot.id)}
              className={cn(
                "h-8 shrink-0 rounded-md px-3.5 text-[13px] font-medium transition-colors",
                selected ? "bg-white/[0.09] text-(--l-fg)" : "text-(--l-fg-subtle) hover:text-(--l-fg-muted)",
              )}
            >
              {shot.label}
            </button>
          );
        })}
      </div>

      <div className="grid">
        {shots.map((shot) => {
          const selected = shot.id === activeId;
          return (
            <div
              key={shot.id}
              role="tabpanel"
              id={`review-panel-${shot.id}`}
              aria-labelledby={`review-tab-${shot.id}`}
              inert={!selected}
              className={cn(
                "col-start-1 row-start-1 transition-opacity duration-300 motion-reduce:transition-none",
                selected ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <ProductShot shot={shot} />
            </div>
          );
        })}
      </div>

      <p className="mx-auto mt-5 max-w-xl text-center text-[14px] leading-relaxed text-pretty text-(--l-fg-muted)" aria-live="polite">
        {active.caption}
      </p>
    </div>
  );
}
