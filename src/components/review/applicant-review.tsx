"use client";

import { CheckIcon, HeartIcon, UsersIcon, ZoomInIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { markApplicationViewed, setApplicationLiked, setApplicationStage } from "@/app/(employer)/[company]/actions";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { JobApplicant } from "@/lib/companies/workspace";
import { documentUrl } from "@/lib/review/documents";
import { summarizeFilters } from "@/lib/review/matches";
import { orderApplicants, type PlaylistOrder } from "@/lib/review/order";
import {
  initialIndex,
  matchesPlaylist,
  nextTarget,
  nextUnviewed,
  previousTarget,
  type PlaylistFilter,
  type StageFilter,
} from "@/lib/review/navigation";
import { HIRING_STAGE_LABELS, stageForKey, type HiringStage } from "@/lib/review/stages";
import { ApplicantSummary, NoAutoRejectNote, ReviewActions, ScreeningOverview, StageControl } from "./ats-panel";
import { CandidatePlaylist, type PlaylistItem } from "./candidate-playlist";
import { usePdfDocuments } from "./pdf";
import { DocumentHeader, PdfPages, SHEET_CLASS } from "./pdf-viewer";
import { ReviewTopBar, type ReviewJob } from "./review-frame";

// The review screen (features/applicant-review.md), Fast Manual Mode on real applications. From
// 1280px: the playlist, the CV, the cover letter and the screening overview side by side. From
// 1024px the playlist moves into a sheet; below that one view at a time, with the actions in a bar
// at the bottom.
//
// Next marks the open applicant viewed and opens the next one not viewed yet; the heart likes them,
// and the status control decides something about them (features/application-status.md). Next and ←
// keep to the applicants the playlist shows (All or Liked, and the status filter), and once all of
// those are viewed Next goes down the list in order, for another look. All the marks show at once and
// are saved in the background, and put back with a note if saving fails. The documents of the
// applicants Next and ← would open are loaded ahead, so moving on is immediate.
//
// The cover letter starts smaller than the CV so all of it fits on one screen. Hovering it (after a
// moment) or focusing it opens it wide over the CV, at reading size; moving away closes it. It opens
// over the CV rather than over the overview so Next stays where the hand expects it.

type Direction = "next" | "prev";
type Marks = Record<string, { viewed: boolean; liked: boolean; stage: HiringStage }>;
type MobileView = "cv" | "letter" | "overview";

const LETTER_ZOOM = 0.8;
const OPEN_DELAY_MS = 250;
const CLOSE_DELAY_MS = 150;

// Media queries for the layouts above; the letter only opens wide where it sits beside the CV.
const SIDE_BY_SIDE = "(min-width: 64rem)";
const WITH_PLAYLIST = "(min-width: 80rem)";

export function ApplicantReview({
  companySlug,
  job,
  applicants,
}: {
  companySlug: string;
  job: ReviewJob;
  applicants: JobApplicant[];
}) {
  const searchParams = useSearchParams();
  const [marks, setMarks] = useState<Marks>(() =>
    Object.fromEntries(applicants.map((a) => [a.id, { viewed: a.viewed, liked: a.liked, stage: a.stage }])),
  );
  // What the screening saved for each applicant, and what the screen shows of it
  // (features/cv-screening.md).
  const summaries = useMemo(
    () =>
      new Map(
        applicants.map((a) => [
          a.id,
          summarizeFilters(job.requiredFilters, job.optionalFilters, {
            matched: a.matchedFilters,
            unverified: a.unverifiedFilters,
            outcome: a.screeningOutcome,
          }),
        ]),
      ),
    [applicants, job.requiredFilters, job.optionalFilters],
  );
  // The playlist's order: as the applications came in, or the best keyword match first. Next, ← and
  // the list all walk `items`, so they can't disagree about it.
  const [order, setOrder] = useState<PlaylistOrder>("applied");
  const ordered = useMemo(() => orderApplicants(applicants, summaries, order), [applicants, summaries, order]);
  const items = useMemo(() => ordered.map((a) => ({ ...a, ...marks[a.id] })), [ordered, marks]);
  // With no filters there is nothing to put in order by.
  const canOrder = job.requiredFilters.length + job.optionalFilters.length > 0;
  const [index, setIndex] = useState(() => initialIndex(items, searchParams.get("candidate")));
  // Null until the first move, so the documents don't slide in on page load.
  const [direction, setDirection] = useState<Direction | null>(null);
  const [filter, setFilter] = useState<PlaylistFilter>("all");
  const [stageFilter, setStageFilter] = useState<StageFilter>("any");
  const [complete, setComplete] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("cv");
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [cvZoom, setCvZoom] = useState(1);
  const [letterZoom, setLetterZoom] = useState(LETTER_ZOOM);
  const [letterOpen, setLetterOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { open, keep } = usePdfDocuments();

  const current = items[index];
  const viewedCount = items.filter((item) => item.viewed).length;
  const likedCount = items.filter((item) => item.liked).length;

  const summary = summaries.get(current.id)!;

  const playlist: PlaylistItem[] = items.map((item) => {
    const s = summaries.get(item.id)!;
    return {
      id: item.id,
      name: item.name,
      location: item.location,
      viewed: item.viewed,
      liked: item.liked,
      stage: item.stage,
      requiredScore:
        s.status === "checked" && s.required.length > 0
          ? { met: s.requiredMet, total: s.required.length, unverified: s.requiredUnverified }
          : null,
    };
  });

  const cvUrl = current.cvFileName ? documentUrl(current.id, "cv") : null;
  const letterUrl = current.coverLetterFileName ? documentUrl(current.id, "cover-letter") : null;
  // A cover letter typed in the apply dialog (features/candidate-cvs.md); an application has a PDF or
  // a text, never both.
  const letterText = letterUrl ? null : current.coverLetterText;

  // What Next and ← open, among the applicants the playlist shows. At the end of a narrowed list,
  // while others are still new, Next carries on with those (and the playlist goes back to everyone).
  const shows = (item: { liked: boolean; stage: HiringStage }) => matchesPlaylist(item, filter, stageFilter);
  const narrowed = filter !== "all" || stageFilter !== "any";
  const nextInList = nextTarget(items, index, shows);
  const nextIndex = nextInList ?? (narrowed ? nextUnviewed(items, index) : null);
  const previousIndex = previousTarget(items, index, shows);

  // Load ahead what Next and ← would open; close everything else.
  useEffect(() => {
    const around = [index, nextIndex, previousIndex].filter((i): i is number => i !== null);
    const urls = new Set<string>();
    for (const i of around) {
      const item = items[i];
      if (item.cvFileName) urls.add(documentUrl(item.id, "cv"));
      if (item.coverLetterFileName) urls.add(documentUrl(item.id, "cover-letter"));
    }
    keep([...urls]);
  }, [items, index, nextIndex, previousIndex, keep]);

  // The open applicant is in the URL, so a reload comes back to them (Next reads native
  // history.replaceState into useSearchParams).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("candidate") === current.id) return;
    params.set("candidate", current.id);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [current.id]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function setMark(id: string, mark: Partial<Marks[string]>) {
    setMarks((all) => ({ ...all, [id]: { ...all[id], ...mark } }));
  }

  function markViewed(id: string) {
    setMark(id, { viewed: true });
    markApplicationViewed(id).then(
      (result) => {
        if (!result.ok) {
          setMark(id, { viewed: false });
          setNotice(result.error);
        }
      },
      () => {
        setMark(id, { viewed: false });
        setNotice("Could not save. Check your connection.");
      },
    );
  }

  function moveTo(target: number, dir: Direction) {
    setDirection(dir);
    setIndex(target);
    setComplete(false);
    setLetterOpen(false);
  }

  // Moving on by anything but Next, which marks viewed itself. An applicant given a status counts as
  // viewed from here, not from when it was chosen: Next from the last new one has to end the pass, and
  // it only knows to while they are still new.
  function go(target: number, dir: Direction) {
    if (!current.viewed && current.stage !== "APPLIED") markViewed(current.id);
    moveTo(target, dir);
  }

  function next() {
    // While the end screen is up, Next waits for a choice on it.
    if (complete) return;
    if (!current.viewed) markViewed(current.id);
    if (nextIndex === null) {
      setComplete(true);
      setLetterOpen(false);
      return;
    }
    if (nextInList === null) {
      setFilter("all");
      setStageFilter("any");
    }
    moveTo(nextIndex, "next");
  }

  function previous() {
    if (previousIndex !== null) go(previousIndex, "prev");
  }

  function toggleLike() {
    const id = current.id;
    const liked = !current.liked;
    setMark(id, { liked });
    setApplicationLiked(id, liked).then(
      (result) => {
        if (!result.ok) {
          setMark(id, { liked: !liked });
          setNotice(result.error);
        }
      },
      () => {
        setMark(id, { liked: !liked });
        setNotice("Could not save. Check your connection.");
      },
    );
  }

  function changeStage(stage: HiringStage) {
    const id = current.id;
    const previousStage = current.stage;
    if (stage === previousStage) return;
    setMark(id, { stage });
    // Put back only if nothing newer was chosen while this was saving.
    const putBack = (message: string) => {
      setMarks((all) => (all[id].stage === stage ? { ...all, [id]: { ...all[id], stage: previousStage } } : all));
      setNotice(message);
    };
    setApplicationStage(id, stage).then(
      (result) => {
        if (!result.ok) putBack(result.error);
      },
      () => putBack("Could not save. Check your connection."),
    );
  }

  // The open applicant stays open when the order changes; only where they stand in the list does.
  function changeOrder(next: PlaylistOrder) {
    if (next === order) return;
    const reordered = orderApplicants(applicants, summaries, next);
    setOrder(next);
    setIndex(Math.max(0, reordered.findIndex((a) => a.id === current.id)));
  }

  function select(id: string) {
    const target = items.findIndex((item) => item.id === id);
    if (target === -1) return;
    setPlaylistOpen(false);
    if (target === index) {
      setComplete(false);
      return;
    }
    go(target, target > index ? "next" : "prev");
  }

  function showLiked() {
    setFilter("liked");
    setStageFilter("any");
    const firstLiked = items.findIndex((item) => item.liked);
    if (firstLiked !== -1) go(firstLiked, "next");
    if (!window.matchMedia(WITH_PLAYLIST).matches) setPlaylistOpen(true);
  }

  function startOver() {
    setFilter("all");
    setStageFilter("any");
    go(0, "next");
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='listbox']")) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      previous();
      return;
    }
    if (event.key === "Escape") {
      if (letterOpen) setLetterOpen(false);
      return;
    }
    // A focused select takes letters and digits for itself (type to choose).
    if (target?.closest("[role='combobox']")) return;
    const stage = stageForKey(event.key);
    if (stage) {
      event.preventDefault();
      changeStage(stage);
    } else if (event.key === "l" || event.key === "L") {
      event.preventDefault();
      toggleLike();
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const docAnimation = direction === "next" ? "l-doc-next" : direction === "prev" ? "l-doc-prev" : undefined;
  const playlistProps = {
    items: playlist,
    currentId: current.id,
    filter,
    onFilter: setFilter,
    stageFilter,
    onStageFilter: setStageFilter,
    order: canOrder ? order : null,
    onOrder: changeOrder,
    onSelect: select,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReviewTopBar companySlug={companySlug} job={job}>
        <p className="font-mono text-[12px] text-(--l-fg-muted) tabular-nums max-sm:hidden">
          {viewedCount}
          <span className="text-(--l-fg-subtle)"> / {items.length} viewed</span>
        </p>
        <button
          type="button"
          onClick={() => setPlaylistOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-(--l-line-strong) bg-white/[0.03] px-2.5 text-[13px] text-(--l-fg-muted) transition-colors hover:bg-white/[0.07] hover:text-(--l-fg) xl:hidden"
        >
          <UsersIcon aria-hidden className="size-4" />
          <span className="font-mono text-[12px] tabular-nums">
            {index + 1}/{items.length}
          </span>
          <span className="sr-only">Show candidates</span>
        </button>
      </ReviewTopBar>

      {/* How far through the list: viewed of all. */}
      <div className="h-px shrink-0 bg-(--l-line)">
        <div
          className="h-px bg-(--l-lime) transition-[width] duration-500 ease-out"
          style={{ width: `${(viewedCount / items.length) * 100}%` }}
        />
      </div>

      {/* Below lg: one view at a time. */}
      <div className="flex shrink-0 gap-1 border-b border-(--l-line) p-2 lg:hidden" role="tablist" aria-label="View">
        {(
          [
            ["cv", "CV"],
            ["letter", "Cover letter"],
            ["overview", "Overview"],
          ] as const
        ).map(([view, label]) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={mobileView === view}
            onClick={() => setMobileView(view)}
            className={cn(
              "h-8 flex-1 rounded-md text-[13px] font-medium transition-colors",
              mobileView === view ? "bg-white/[0.08] text-(--l-fg)" : "text-(--l-fg-subtle) hover:text-(--l-fg-muted)",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[15rem_minmax(0,1fr)_17rem]">
        <aside className="hidden min-h-0 flex-col border-r border-(--l-line) bg-(--l-surface) xl:flex">
          <CandidatePlaylist {...playlistProps} />
        </aside>

        {/* The two documents. From lg the letter is laid over the right part of this area, so it can
            open wide over the CV; the grid keeps the CV to the left of it. */}
        <div
          className={cn(
            "relative min-h-0 min-w-0 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]",
            mobileView === "overview" && "max-lg:hidden",
          )}
        >
          <section
            aria-label="CV"
            className={cn("flex h-full min-h-0 min-w-0 flex-col bg-(--l-surface-2)", mobileView !== "cv" && "max-lg:hidden")}
          >
            <DocumentHeader label="CV" fileName={current.cvFileName} zoom={cvZoom} onZoom={setCvZoom} />
            <div key={current.id} className="l-scroll min-h-0 flex-1 overflow-auto p-3 sm:p-5">
              <div className={cn("flex min-h-full flex-col", docAnimation)}>
                {cvUrl ? (
                  <PdfPages url={cvUrl} zoom={cvZoom} open={open} />
                ) : (
                  <NoDocument>No CV was attached to this application.</NoDocument>
                )}
              </div>
            </div>
          </section>

          <CoverLetterPane
            open={letterOpen}
            onOpenChange={setLetterOpen}
            expandable={letterUrl !== null || letterText !== null}
            className={cn(mobileView !== "letter" && "max-lg:hidden")}
          >
            <DocumentHeader
              label="Cover letter"
              fileName={current.coverLetterFileName}
              zoom={letterOpen ? Math.max(letterZoom, 1) : letterZoom}
              onZoom={setLetterZoom}
            >
              {letterText !== null && (
                <p className="min-w-0 truncate text-[11px] text-(--l-fg-subtle)">Written in the application</p>
              )}
            </DocumentHeader>
            <div key={current.id} className="l-scroll min-h-0 flex-1 overflow-auto p-3 sm:p-5">
              <div className={cn("flex min-h-full flex-col", docAnimation)} style={{ animationDelay: "70ms" }}>
                {(letterUrl || letterText !== null) && (
                  <p
                    aria-hidden
                    className={cn(
                      "mb-3 hidden items-center justify-center gap-1.5 text-[11px] text-(--l-fg-subtle) transition-opacity",
                      "lg:[@media(hover:hover)]:flex",
                      letterOpen && "opacity-0",
                    )}
                  >
                    <ZoomInIcon className="size-3.5" /> Hover to zoom
                  </p>
                )}
                {letterUrl ? (
                  <PdfPages url={letterUrl} zoom={letterOpen ? Math.max(letterZoom, 1) : letterZoom} open={open} />
                ) : letterText !== null ? (
                  <TextLetter text={letterText} />
                ) : (
                  <NoDocument>No cover letter with this application.</NoDocument>
                )}
              </div>
            </div>
          </CoverLetterPane>

          {complete && (
            <ReviewComplete
              total={items.length}
              likedCount={likedCount}
              companySlug={companySlug}
              onShowLiked={showLiked}
              onStartOver={startOver}
            />
          )}
        </div>

        <aside
          className={cn(
            "flex min-h-0 flex-col bg-(--l-surface) lg:border-l lg:border-(--l-line)",
            mobileView !== "overview" && "max-lg:hidden",
          )}
        >
          <div className="l-scroll min-h-0 flex-1 overflow-y-auto p-4">
            <div key={current.id} className={cn("flex flex-col gap-5", docAnimation)}>
              <ApplicantSummary name={current.name} location={current.location} appliedAt={current.appliedAt} />
              <div className="h-px bg-(--l-line)" />
              <ScreeningOverview summary={summary} />
              <NoAutoRejectNote />
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 border-t border-(--l-line) p-4 max-lg:hidden">
            <StageControl stage={current.stage} onChange={changeStage} />
            <ReviewActions liked={current.liked} onLike={toggleLike} onNext={next} />
          </div>
        </aside>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-(--l-line) bg-(--l-surface) p-3 lg:hidden">
        <StageControl stage={current.stage} onChange={changeStage} compact />
        <ReviewActions liked={current.liked} onLike={toggleLike} onNext={next} compact />
      </div>

      <Sheet open={playlistOpen} onOpenChange={setPlaylistOpen}>
        <SheetContent
          side="left"
          data-landing
          className="dark gap-0 border-(--l-line) p-0 data-[side=left]:w-72"
        >
          <SheetTitle className="sr-only">Candidates</SheetTitle>
          <div className="flex min-h-0 flex-1 flex-col pt-10">
            <CandidatePlaylist {...playlistProps} />
          </div>
        </SheetContent>
      </Sheet>

      {notice && (
        <p
          role="status"
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-(--l-line-strong) bg-(--l-surface-3) px-3.5 py-2 text-[13px] text-(--l-fg) shadow-[0_12px_40px_-12px_rgb(0_0_0/0.8)] lg:bottom-6"
        >
          {notice}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {`Candidate ${index + 1} of ${items.length}: ${current.name}, ${HIRING_STAGE_LABELS[current.stage]}`}
      </p>
    </div>
  );
}

// The cover letter's frame. From lg it sits over the right-hand column of the documents area and
// opens wide over the CV on hover (after a moment, so passing over it does nothing) or on focus.
function CoverLetterPane({
  open,
  onOpenChange,
  expandable,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expandable: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const paneRef = useRef<HTMLElement>(null);
  // Whether the mouse is over the pane, and whether it was closed while it was (Esc, or Next from the
  // keyboard): then it stays closed until the mouse leaves, instead of opening again on the next move.
  const inside = useRef(false);
  const held = useRef(false);
  const wasOpen = useRef(open);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (wasOpen.current && !open && inside.current) held.current = true;
    wasOpen.current = open;
  }, [open]);

  function schedule(next: boolean, delay: number) {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (next && (!expandable || !window.matchMedia(SIDE_BY_SIDE).matches)) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      onOpenChange(next);
    }, delay);
  }

  return (
    <section
      ref={paneRef}
      aria-label="Cover letter"
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        inside.current = true;
        schedule(true, OPEN_DELAY_MS);
      }}
      // The pane can appear under a mouse that is already there (Lets start sits where the letter
      // opens), and then no pointerenter comes: the first move inside counts as one.
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;
        inside.current = true;
        if (!open && !held.current && timer.current === undefined) schedule(true, OPEN_DELAY_MS);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        inside.current = false;
        held.current = false;
        schedule(false, CLOSE_DELAY_MS);
      }}
      onFocus={() => schedule(true, 0)}
      onBlur={(event) => {
        if (!paneRef.current?.contains(event.relatedTarget as Node | null)) schedule(false, 0);
      }}
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col bg-(--l-surface-2)",
        "lg:absolute lg:inset-y-0 lg:right-0 lg:border-l lg:border-(--l-line)",
        "lg:transition-[left,box-shadow] lg:duration-300 lg:ease-(--l-ease) motion-reduce:transition-none",
        open ? "lg:left-0 lg:z-20 lg:shadow-[-24px_0_60px_-20px_rgb(0_0_0/0.85)]" : "lg:left-[58.3333%]",
        className,
      )}
    >
      {children}
    </section>
  );
}

// A typed cover letter on a sheet like the PDFs' pages. Plain text, never HTML: it is what the
// candidate typed.
function TextLetter({ text }: { text: string }) {
  return (
    <div className={cn(SHEET_CLASS, "w-full px-6 py-7 text-[13px] leading-relaxed whitespace-pre-wrap text-neutral-800 sm:px-10 sm:py-9")}>
      {text}
    </div>
  );
}

function NoDocument({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-48 flex-1 items-center justify-center px-6 text-center">
      <p className="max-w-56 text-[12.5px] leading-relaxed text-(--l-fg-subtle)">{children}</p>
    </div>
  );
}

function ReviewComplete({
  total,
  likedCount,
  companySlug,
  onShowLiked,
  onStartOver,
}: {
  total: number;
  likedCount: number;
  companySlug: string;
  onShowLiked: () => void;
  onStartOver: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-(--l-bg)/75 p-6 backdrop-blur-sm">
      <div
        role="status"
        className="l-rise flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border border-(--l-line-strong) bg-(--l-surface) p-6 text-center shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)]"
      >
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-(--l-lime)/[0.12] text-(--l-lime)">
          <CheckIcon aria-hidden className="size-5" />
        </span>
        <p className="text-[16px] font-semibold tracking-[-0.01em]">All candidates viewed</p>
        <p className="text-[13px] leading-relaxed text-(--l-fg-muted)">
          You&rsquo;ve been through all {total} {total === 1 ? "applicant" : "applicants"}
          {likedCount > 0 ? `, and liked ${likedCount}.` : "."}
        </p>
        <div className="mt-2 flex w-full flex-col gap-2">
          {likedCount > 0 && (
            <button
              type="button"
              onClick={onShowLiked}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-(--l-lime) px-4 text-[13px] font-medium text-(--l-on-lime) transition-colors hover:bg-(--l-lime-hover)"
            >
              <HeartIcon aria-hidden className="size-3.5" /> Show liked ({likedCount})
            </button>
          )}
          <button
            type="button"
            onClick={onStartOver}
            className="inline-flex h-9 items-center justify-center rounded-md border border-(--l-line-strong) bg-white/[0.03] px-4 text-[13px] text-(--l-fg-muted) transition-colors hover:bg-white/[0.07] hover:text-(--l-fg)"
          >
            Start from the top
          </button>
          <Link
            href={`/${companySlug}`}
            className="inline-flex h-9 items-center justify-center rounded-md px-4 text-[13px] text-(--l-fg-subtle) transition-colors hover:text-(--l-fg)"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
