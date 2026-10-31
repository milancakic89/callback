import { ArrowLeftIcon, InboxIcon } from "lucide-react";
import Link from "next/link";

// The frame of the review screen (features/applicant-review.md): the top bar, and the two states
// that have no applicant to show (loading, and a job nobody applied to). No hooks, so the server
// renders these and the client review reuses the bar.

export type ReviewJob = {
  id: string;
  title: string;
  isDemo: boolean;
  requiredFilters: string[];
  optionalFilters: string[];
};

export function ReviewTopBar({
  companySlug,
  job,
  children,
}: {
  companySlug: string;
  job: Pick<ReviewJob, "title" | "isDemo">;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-(--l-line) bg-(--l-surface) px-3 sm:px-4">
      <Link
        href={`/${companySlug}`}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] text-(--l-fg-muted) transition-colors hover:bg-white/[0.05] hover:text-(--l-fg)"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        <span className="max-sm:sr-only">Dashboard</span>
      </Link>
      <span aria-hidden className="h-5 w-px shrink-0 bg-(--l-line-strong)" />
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-[14px] font-medium">{job.title}</h1>
        {job.isDemo && (
          <span className="shrink-0 rounded-full border border-(--l-line-strong) bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] font-medium tracking-[0.08em] text-(--l-fg-muted) uppercase">
            Demo
          </span>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">{children}</div>
    </header>
  );
}

// The grid the review uses (applicant-review.tsx), in placeholders.
export function ReviewSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading applicants">
      <div className="h-14 shrink-0 border-b border-(--l-line) bg-(--l-surface)" />
      <div className="h-px shrink-0 bg-(--l-line)" />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_17rem] xl:grid-cols-[15rem_minmax(0,1.4fr)_minmax(0,1fr)_17rem]">
        <div className="hidden flex-col gap-2 border-r border-(--l-line) bg-(--l-surface) p-3 xl:flex">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-white/[0.03] motion-safe:animate-pulse" />
          ))}
        </div>
        <div className="bg-(--l-surface-2) p-4">
          <div className="mx-auto aspect-[210/297] max-w-[56rem] bg-white/[0.04] motion-safe:animate-pulse" />
        </div>
        <div className="hidden border-l border-(--l-line) bg-(--l-surface-2) p-4 lg:block">
          <div className="mx-auto aspect-[210/297] w-4/5 bg-white/[0.04] motion-safe:animate-pulse" />
        </div>
        <div className="hidden flex-col gap-3 border-l border-(--l-line) bg-(--l-surface) p-4 lg:flex">
          <div className="h-5 w-2/3 rounded bg-white/[0.05]" />
          <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
          <div className="mt-4 h-24 rounded-lg bg-white/[0.03] motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function ReviewEmpty({ companySlug, job }: { companySlug: string; job: ReviewJob }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReviewTopBar companySlug={companySlug} job={job} />
      <div className="dark-top-light flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="inline-flex size-11 items-center justify-center rounded-xl border border-(--l-line-strong) bg-white/[0.03]">
          <InboxIcon aria-hidden className="size-5 text-(--l-fg-muted)" />
        </span>
        <p className="text-[15px] font-medium">No applicants to review</p>
        <p className="max-w-sm text-[13px] leading-relaxed text-(--l-fg-subtle)">
          When candidates apply to this job, they show up here with their CV and cover letter.
        </p>
        <Link
          href={`/${companySlug}`}
          className="mt-2 inline-flex h-9 items-center rounded-md bg-(--l-lime) px-4 text-[13px] font-medium text-(--l-on-lime) transition-colors hover:bg-(--l-lime-hover)"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
