import { ChevronLeftIcon, ChevronRightIcon, FileTextIcon } from "lucide-react";
import { cn } from "cn";
import { SAMPLE_CANDIDATES, SAMPLE_ROLE } from "./sample-documents";
import { Initials } from "./ui";

// The hero's product shot: a recruiter's review workspace (CV left, cover letter right) and, on top
// of it, the update the candidate receives when the recruiter moves them on. Static markup with CSS
// motion only (landing.css): the stage flips Screening → Interview, then the update arrives.
// Decorative — the interactive version is ReviewDemo further down the page.
export function HeroVisual() {
  const candidate = SAMPLE_CANDIDATES[0];

  return (
    <div aria-hidden inert className="relative select-none">
      <div className="l-window-in">
        <div className="l-fade-bottom">
          <div className="overflow-hidden rounded-xl border border-(--l-line-strong) bg-(--l-surface) shadow-[0_60px_160px_-40px_rgb(0_0_0/0.95)]">
            <div className="flex h-12 items-center gap-3 border-b border-(--l-line) px-3 sm:px-4">
              <p className="hidden min-w-0 truncate text-[13px] text-(--l-fg-subtle) lg:block lg:w-[34%]">
                {SAMPLE_ROLE.company}
                <span className="px-1.5 text-(--l-fg-subtle)/60">/</span>
                <span className="text-(--l-fg-muted)">{SAMPLE_ROLE.title}</span>
              </p>
              <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:justify-center">
                <Initials name={candidate.name} className="size-6 text-[9.5px]" />
                <p className="truncate text-[13px] font-medium">{candidate.name}</p>
                <span className="hidden font-mono text-[11px] text-(--l-fg-subtle) tabular-nums sm:inline">12 / 48</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 lg:w-[34%] lg:justify-end">
                <StageChip />
                <span className="hidden size-7 items-center justify-center rounded-md border border-(--l-line-strong) text-(--l-fg-subtle) sm:inline-flex">
                  <ChevronLeftIcon className="size-4" />
                </span>
                <span className="inline-flex h-7 items-center gap-1 rounded-md bg-(--l-lime) px-2.5 text-[12px] font-medium text-(--l-on-lime)">
                  Next
                  <ChevronRightIcon className="size-3.5" />
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-(--l-line)">
              <Pane label="CV" fileName={candidate.cvFile}>
                <candidate.Cv />
              </Pane>
              <Pane label="Cover letter" fileName={candidate.letterFile} className="max-md:hidden">
                <candidate.Letter />
              </Pane>
            </div>
          </div>
        </div>
      </div>

      {/* What the candidate sees once the stage changes. */}
      <div className="l-notify absolute right-3 bottom-[22%] w-[min(19rem,calc(100%-1.5rem))] rounded-xl border border-(--l-line-strong) bg-[#17171b]/95 p-4 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.8)] backdrop-blur-md sm:right-8 sm:w-80 lg:-right-5 lg:bottom-[30%]">
        <div className="flex items-center gap-2 text-[11.5px] text-(--l-fg-subtle)">
          <span className="relative flex size-2">
            <span className="l-ping absolute inset-0 rounded-full bg-(--l-lime)" />
            <span className="relative size-2 rounded-full bg-(--l-lime)" />
          </span>
          <span>Application update</span>
          <span className="ml-auto">now</span>
        </div>
        <p className="mt-2.5 text-[14.5px] leading-snug font-medium">You&rsquo;ve been invited to interview</p>
        <p className="mt-1 text-[13px] leading-snug text-(--l-fg-muted)">
          {SAMPLE_ROLE.title} at {SAMPLE_ROLE.company}. The team will be in touch to find a time.
        </p>
      </div>
    </div>
  );
}

function StageChip() {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-(--l-line-strong) bg-white/[0.03] px-2.5 text-[12px]">
      <span className="hidden text-(--l-fg-subtle) sm:inline">Stage</span>
      <span className="inline-grid">
        <span className="l-swap-out col-start-1 row-start-1 inline-flex items-center gap-1.5 text-(--l-fg-muted)">
          <span className="size-1.5 rounded-full bg-(--l-fg-subtle)" />
          Screening
        </span>
        <span className="l-swap-in col-start-1 row-start-1 inline-flex items-center gap-1.5 text-(--l-fg)">
          <span className="size-1.5 rounded-full bg-(--l-lime)" />
          Interview
        </span>
      </span>
    </span>
  );
}

function Pane({
  label,
  fileName,
  className,
  children,
}: {
  label: string;
  fileName: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex h-9 items-center gap-2 border-b border-(--l-line) px-3 sm:px-4">
        <FileTextIcon className="size-3.5 shrink-0 text-(--l-fg-subtle)" />
        <p className="shrink-0 text-[12px] font-medium text-(--l-fg-muted)">{label}</p>
        <p className="min-w-0 truncate font-mono text-[11px] text-(--l-fg-subtle)">{fileName}</p>
        <p className="ml-auto shrink-0 font-mono text-[11px] text-(--l-fg-subtle)">100%</p>
      </div>
      <div className="h-[380px] overflow-hidden bg-(--l-surface-2) p-4 sm:h-[460px] sm:p-7 lg:h-[520px]">
        <div style={{ "--z": 0.94 } as React.CSSProperties}>{children}</div>
      </div>
    </div>
  );
}
