"use client";

import { FileTextIcon, MinusIcon, PlusIcon, RotateCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { cn } from "cn";
import { DocumentLoadError } from "./pdf";

// One document of the review screen (features/applicant-review.md): a header with its name and zoom,
// and its pages drawn on canvases as sheets of paper, like the landing's Fast Manual Mode demo. There
// is no download, print or text layer: the file is for reading here, and access to it ends when the
// application does.

export const ZOOM_STEPS = [0.6, 0.8, 1, 1.2, 1.4, 1.6];

// A4, until the page itself says otherwise.
const DEFAULT_PAGE_RATIO = 297 / 210;

// The widest a sheet gets at 100%, so a page on a very wide screen doesn't grow past reading size.
const MAX_SHEET_REM = 56;

const SHEET_CLASS =
  "relative bg-(--l-paper) shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_1px_2px_rgb(0_0_0/0.3),0_12px_32px_-8px_rgb(0_0_0/0.55)]";

export function DocumentHeader({
  label,
  fileName,
  zoom,
  onZoom,
  children,
}: {
  label: string;
  fileName: string | null;
  zoom: number;
  onZoom: (zoom: number) => void;
  children?: React.ReactNode;
}) {
  const step = ZOOM_STEPS.indexOf(zoom);

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-(--l-line) px-3">
      <FileTextIcon aria-hidden className="size-3.5 shrink-0 text-(--l-fg-subtle)" />
      <p className="shrink-0 text-[12px] font-medium text-(--l-fg-muted)">{label}</p>
      {fileName && <p className="min-w-0 truncate font-mono text-[11px] text-(--l-fg-subtle)">{fileName}</p>}
      {children}
      {fileName && (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <ZoomButton label={`Zoom out ${label}`} disabled={step <= 0} onClick={() => onZoom(ZOOM_STEPS[step - 1])}>
            <MinusIcon className="size-3.5" />
          </ZoomButton>
          <p className="w-10 text-center font-mono text-[11px] text-(--l-fg-muted) tabular-nums">
            {Math.round(zoom * 100)}%
          </p>
          <ZoomButton
            label={`Zoom in ${label}`}
            disabled={step >= ZOOM_STEPS.length - 1}
            onClick={() => onZoom(ZOOM_STEPS[step + 1])}
          >
            <PlusIcon className="size-3.5" />
          </ZoomButton>
        </div>
      )}
    </div>
  );
}

function ZoomButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex size-6 items-center justify-center rounded text-(--l-fg-subtle) transition-colors hover:bg-white/[0.06] hover:text-(--l-fg) disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

// The document's pages, or a sheet-shaped placeholder while it loads, or what went wrong. `url` is
// fixed for the component's life: a new applicant mounts a new one (keyed by the parent), which
// starts at the top, like opening a fresh file.
export function PdfPages({
  url,
  zoom,
  open,
}: {
  url: string;
  zoom: number;
  open: (url: string) => Promise<PDFDocumentProxy>;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; doc: PDFDocumentProxy } | { status: "error"; gone: boolean }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    open(url).then(
      (doc) => {
        if (!cancelled) setState({ status: "ready", doc });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", gone: error instanceof DocumentLoadError && error.status === 404 });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url, open, attempt]);

  const width = { width: `${zoom * 100}%`, maxWidth: `${zoom * MAX_SHEET_REM}rem` };

  if (state.status === "error") {
    return (
      <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[13px] font-medium text-(--l-fg)">Couldn&rsquo;t open this document</p>
        <p className="max-w-64 text-[12px] leading-relaxed text-(--l-fg-subtle)">
          {state.gone
            ? "It is no longer available. The application may have been withdrawn."
            : "Check your connection and try again."}
        </p>
        {!state.gone && (
          <button
            type="button"
            onClick={() => {
              setState({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-(--l-line-strong) bg-white/[0.03] px-3 text-[13px] text-(--l-fg-muted) transition-colors hover:bg-white/[0.07] hover:text-(--l-fg)"
          >
            <RotateCwIcon className="size-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-col gap-4" style={width}>
      {state.status === "loading" ? (
        <div className={cn(SHEET_CLASS, "overflow-hidden")} style={{ aspectRatio: 1 / DEFAULT_PAGE_RATIO }}>
          <SheetPlaceholder />
        </div>
      ) : (
        Array.from({ length: state.doc.numPages }, (_, i) => (
          <PdfPage key={i} doc={state.doc} pageNumber={i + 1} />
        ))
      )}
    </div>
  );
}

// Faint text lines on the paper while the file arrives, so the sheet doesn't flash empty.
function SheetPlaceholder() {
  return (
    <div aria-hidden className="flex flex-col gap-[0.9em] p-[9%] text-[10px] motion-safe:animate-pulse">
      <div className="h-[2.2em] w-1/2 rounded-sm bg-black/[0.07]" />
      <div className="h-[0.8em] w-1/3 rounded-sm bg-black/[0.05]" />
      <div className="mt-[1.5em] h-[0.7em] w-full rounded-sm bg-black/[0.05]" />
      <div className="h-[0.7em] w-11/12 rounded-sm bg-black/[0.05]" />
      <div className="h-[0.7em] w-4/5 rounded-sm bg-black/[0.05]" />
      <div className="mt-[1.5em] h-[0.7em] w-full rounded-sm bg-black/[0.05]" />
      <div className="h-[0.7em] w-5/6 rounded-sm bg-black/[0.05]" />
    </div>
  );
}

// One page. It is drawn at the sheet's width in device pixels, and drawn again (after the size has
// settled) when the sheet is resized: by zoom, by the window, or by the cover letter opening wide.
// Between the two the browser scales the last drawing, so a resize never shows an empty sheet. The
// drawing goes to a canvas off screen and is copied over when complete, for the same reason.
function PdfPage({ doc, pageNumber }: { doc: PDFDocumentProxy; pageNumber: number }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(DEFAULT_PAGE_RATIO);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const sheet = sheetRef.current;
    const canvas = canvasRef.current;
    if (!sheet || !canvas) return;

    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let task: RenderTask | null = null;
    let drawnWidth = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function draw() {
      page ??= await doc.getPage(pageNumber);
      if (cancelled || !sheet || !canvas) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);

      const pixelWidth = Math.round(sheet.clientWidth * (window.devicePixelRatio || 1));
      if (pixelWidth === 0 || pixelWidth === drawnWidth) return;

      task?.cancel();
      const viewport = page.getViewport({ scale: pixelWidth / base.width });
      const offscreen = document.createElement("canvas");
      offscreen.width = Math.floor(viewport.width);
      offscreen.height = Math.floor(viewport.height);
      const current = page.render({ canvas: offscreen, viewport });
      task = current;
      try {
        await current.promise;
      } catch {
        return; // cancelled by a newer drawing, or the page went away
      }
      if (cancelled || task !== current) return;

      canvas.width = offscreen.width;
      canvas.height = offscreen.height;
      canvas.getContext("2d")?.drawImage(offscreen, 0, 0);
      drawnWidth = pixelWidth;
      setDrawn(true);
    }

    draw().catch(() => {});
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => draw().catch(() => {}), 140);
    });
    observer.observe(sheet);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer.disconnect();
      task?.cancel();
    };
  }, [doc, pageNumber]);

  return (
    <div ref={sheetRef} className={cn(SHEET_CLASS, "w-full overflow-hidden")} style={{ aspectRatio: 1 / ratio }}>
      {!drawn && <SheetPlaceholder />}
      <canvas
        ref={canvasRef}
        aria-label={`Page ${pageNumber} of ${doc.numPages}`}
        role="img"
        className={cn(
          "absolute inset-0 size-full transition-opacity duration-200",
          drawn ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
