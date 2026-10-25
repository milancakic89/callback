"use client";

import { ChevronLeftIcon, ChevronRightIcon, FileTextIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { SAMPLE_CANDIDATES, SAMPLE_ROLE } from "./sample-documents";
import { Initials, Kbd } from "./ui";

// The Fast Manual Mode demo (features/landing.md): the original CV on the left, the original cover
// letter on the right, Previous / Next between candidates. Each pane scrolls and zooms on its own.
// Below `md` there is room for one document, so a CV / Cover letter switch picks which. The
// candidates are fictional (sample-documents.tsx); nothing here talks to a server.

const ZOOM_STEPS = [0.85, 1, 1.15, 1.3];
const DEFAULT_ZOOM = 1;

type Direction = "next" | "prev";

export function ReviewDemo() {
  const [index, setIndex] = useState(0);
  // null until the first move, so the documents don't slide in on page load.
  const [direction, setDirection] = useState<Direction | null>(null);
  const [mobileDoc, setMobileDoc] = useState<"cv" | "letter">("cv");
  const total = SAMPLE_CANDIDATES.length;
  const candidate = SAMPLE_CANDIDATES[index];

  function go(step: 1 | -1) {
    setDirection(step === 1 ? "next" : "prev");
    setIndex((current) => (current + step + total) % total);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
  }

  const docAnimation = direction === "next" ? "l-doc-next" : direction === "prev" ? "l-doc-prev" : undefined;

  return (
    <div
      role="group"
      aria-roledescription="demo"
      aria-label="Fast Manual Mode, with fictional candidates"
      onKeyDown={handleKeyDown}
      className="overflow-hidden rounded-xl border border-(--l-line-strong) bg-(--l-surface) shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)]"
    >
      {/* Toolbar: the role, the candidate, and the only controls that matter here. */}
      <div className="flex h-14 items-center gap-3 border-b border-(--l-line) px-3 sm:px-4">
        <div className="hidden min-w-0 items-center gap-2 lg:flex lg:w-[30%]">
          <p className="truncate text-[13px] font-medium">{SAMPLE_ROLE.title}</p>
          <p className="shrink-0 text-[13px] text-(--l-fg-subtle)">· {SAMPLE_ROLE.company}</p>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:justify-center">
          <Initials name={candidate.name} />
          <div className="min-w-0">
            <p key={candidate.id} className={cn("truncate text-[14px] font-medium", docAnimation)}>
              {candidate.name}
            </p>
            <p className="truncate text-[12px] text-(--l-fg-subtle)">{candidate.location}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:w-[30%] lg:justify-end">
          <p className="font-mono text-[12px] text-(--l-fg-muted) tabular-nums">
            {index + 1}
            <span className="text-(--l-fg-subtle)"> / {total}</span>
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous candidate"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-(--l-line-strong) bg-white/[0.03] px-2 text-[13px] text-(--l-fg-muted) transition-colors hover:bg-white/[0.07] hover:text-(--l-fg) sm:px-2.5"
            >
              <ChevronLeftIcon className="size-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next candidate"
              className="inline-flex h-8 items-center gap-1 rounded-md bg-(--l-lime) px-2 text-[13px] font-medium text-(--l-on-lime) transition-colors hover:bg-(--l-lime-hover) sm:px-3"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Progress through the (sample) applicant list. */}
      <div className="h-px bg-(--l-line)">
        <div
          className="h-px bg-(--l-lime) transition-[width] duration-500 ease-out"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {/* Below md: choose which document to read. */}
      <div className="flex gap-1 border-b border-(--l-line) p-2 md:hidden" role="tablist" aria-label="Document">
        {(["cv", "letter"] as const).map((doc) => (
          <button
            key={doc}
            type="button"
            role="tab"
            aria-selected={mobileDoc === doc}
            onClick={() => setMobileDoc(doc)}
            className={cn(
              "h-8 flex-1 rounded-md text-[13px] font-medium transition-colors",
              mobileDoc === doc ? "bg-white/[0.08] text-(--l-fg)" : "text-(--l-fg-subtle) hover:text-(--l-fg-muted)",
            )}
          >
            {doc === "cv" ? "CV" : "Cover letter"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-(--l-line)">
        <DocumentPane
          label="CV"
          fileName={candidate.cvFile}
          candidateId={candidate.id}
          animation={docAnimation}
          className={mobileDoc === "cv" ? undefined : "max-md:hidden"}
        >
          <candidate.Cv />
        </DocumentPane>
        <DocumentPane
          label="Cover letter"
          fileName={candidate.letterFile}
          candidateId={candidate.id}
          animation={docAnimation}
          animationDelay={70}
          className={mobileDoc === "letter" ? undefined : "max-md:hidden"}
        >
          <candidate.Letter />
        </DocumentPane>
      </div>

      <p className="sr-only" aria-live="polite">
        {`Candidate ${index + 1} of ${total}: ${candidate.name}`}
      </p>
    </div>
  );
}

function DocumentPane({
  label,
  fileName,
  candidateId,
  animation,
  animationDelay = 0,
  className,
  children,
}: {
  label: string;
  fileName: string;
  candidateId: string;
  animation?: string;
  animationDelay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const scrollRef = useRef<HTMLDivElement>(null);
  const step = ZOOM_STEPS.indexOf(zoom);

  // A new candidate starts at the top of their documents, like opening a fresh file.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [candidateId]);

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex h-10 items-center gap-2 border-b border-(--l-line) px-3 sm:px-4">
        <FileTextIcon className="size-3.5 shrink-0 text-(--l-fg-subtle)" />
        <p className="shrink-0 text-[12px] font-medium text-(--l-fg-muted)">{label}</p>
        <p className="min-w-0 truncate font-mono text-[11px] text-(--l-fg-subtle)">{fileName}</p>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setZoom(ZOOM_STEPS[step - 1])}
            disabled={step <= 0}
            aria-label={`Zoom out ${label}`}
            className="inline-flex size-6 items-center justify-center rounded text-(--l-fg-subtle) transition-colors hover:bg-white/[0.06] hover:text-(--l-fg) disabled:pointer-events-none disabled:opacity-35"
          >
            <MinusIcon className="size-3.5" />
          </button>
          <p className="w-10 text-center font-mono text-[11px] text-(--l-fg-muted) tabular-nums" aria-live="polite">
            {Math.round(zoom * 100)}%
          </p>
          <button
            type="button"
            onClick={() => setZoom(ZOOM_STEPS[step + 1])}
            disabled={step >= ZOOM_STEPS.length - 1}
            aria-label={`Zoom in ${label}`}
            className="inline-flex size-6 items-center justify-center rounded text-(--l-fg-subtle) transition-colors hover:bg-white/[0.06] hover:text-(--l-fg) disabled:pointer-events-none disabled:opacity-35"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        tabIndex={0}
        aria-label={`${label}, scrollable`}
        className="l-scroll h-[min(70vh,560px)] overflow-auto bg-(--l-surface-2) p-3 sm:p-6 lg:h-[620px] lg:p-8"
      >
        <div
          key={candidateId}
          className={animation}
          style={{ "--z": zoom, animationDelay: `${animationDelay}ms` } as React.CSSProperties}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function ReviewDemoHint() {
  return (
    <p className="hidden items-center gap-1.5 text-[12px] text-(--l-fg-subtle) md:flex">
      <Kbd>←</Kbd>
      <Kbd>→</Kbd>
      <span className="ml-1">switch candidates</span>
    </p>
  );
}
