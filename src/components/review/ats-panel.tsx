"use client";

import { ArrowRightIcon, CheckIcon, HeartIcon, InfoIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Kbd } from "@/components/landing/ui";
import { formatAbsolute } from "@/lib/jobs/format";
import type { FilterCheck, FilterSummary } from "@/lib/review/matches";

// The right-hand column of the review screen (features/applicant-review.md): who the applicant is,
// a small screening overview against the job's filters, and the two actions, the heart and Next.
// The overview only informs: nothing is rejected automatically, and real matching comes later.

const TIME_ZONE = "Europe/Belgrade";

export function ApplicantSummary({
  name,
  location,
  appliedAt,
}: {
  name: string;
  location: string | null;
  appliedAt: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="truncate text-[16px] font-semibold tracking-[-0.01em]">{name}</p>
      <p className="truncate text-[12px] text-(--l-fg-muted)">{location ?? "Location not given"}</p>
      <p className="text-[12px] text-(--l-fg-subtle)">Applied {formatAbsolute(appliedAt, TIME_ZONE)}</p>
    </div>
  );
}

export function ScreeningOverview({ summary }: { summary: FilterSummary }) {
  const hasFilters = summary.required.length + summary.optional.length > 0;

  return (
    <section aria-labelledby="screening-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p
          id="screening-heading"
          className="font-mono text-[10.5px] font-medium tracking-[0.14em] text-(--l-fg-subtle) uppercase"
        >
          Screening overview
        </p>
        <span className="rounded-full border border-(--l-line-strong) px-1.5 py-px font-mono text-[9.5px] tracking-[0.08em] text-(--l-fg-subtle) uppercase">
          Preview
        </span>
      </div>

      {!hasFilters ? (
        <p className="text-[12px] leading-relaxed text-(--l-fg-subtle)">This job has no filters to check against.</p>
      ) : (
        <>
          {!summary.checked && (
            <p className="rounded-md border border-(--l-line) bg-white/[0.02] px-2.5 py-2 text-[12px] leading-relaxed text-(--l-fg-muted)">
              Not checked yet. Read the CV to see how it meets the filters.
            </p>
          )}
          {summary.required.length > 0 && (
            <FilterGroup title="Required" checks={summary.required} met={summary.requiredMet} checked={summary.checked} />
          )}
          {summary.optional.length > 0 && (
            <FilterGroup
              title="Nice-to-have"
              checks={summary.optional}
              met={summary.optionalMet}
              checked={summary.checked}
            />
          )}
        </>
      )}
    </section>
  );
}

function FilterGroup({
  title,
  checks,
  met,
  checked,
}: {
  title: string;
  checks: FilterCheck[];
  met: number;
  checked: boolean;
}) {
  const allMet = checked && met === checks.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium">{title}</p>
        {checked && (
          <p className="font-mono text-[12px] tabular-nums">
            <span className={allMet ? "text-(--l-lime)" : "text-(--l-fg)"}>{met}</span>
            <span className="text-(--l-fg-subtle)"> / {checks.length}</span>
          </p>
        )}
      </div>
      {checked && (
        <div aria-hidden className="flex gap-1">
          {checks.map((check) => (
            <span
              key={check.label}
              className={cn("h-1 flex-1 rounded-full", check.met ? "bg-(--l-lime)" : "bg-white/[0.08]")}
            />
          ))}
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-2 text-[12.5px] leading-snug">
            {!checked ? (
              <span aria-hidden className="mt-[0.45em] size-1 shrink-0 rounded-full bg-(--l-fg-subtle)" />
            ) : check.met ? (
              <CheckIcon aria-hidden className="mt-px size-3.5 shrink-0 text-(--l-lime)" />
            ) : (
              <XIcon aria-hidden className="mt-px size-3.5 shrink-0 text-(--l-fg-subtle)" />
            )}
            <span className={checked && !check.met ? "text-(--l-fg-subtle)" : "text-(--l-fg-muted)"}>
              {check.label}
              {checked && <span className="sr-only">{check.met ? ", met" : ", missing"}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NoAutoRejectNote() {
  return (
    <p className="flex gap-2 text-[11.5px] leading-relaxed text-(--l-fg-subtle)">
      <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      Nothing is rejected automatically. You decide who moves on.
    </p>
  );
}

// The heart and Next, with their keys. `compact` is the bar at the bottom of a phone screen.
export function ReviewActions({
  liked,
  onLike,
  onNext,
  compact = false,
}: {
  liked: boolean;
  onLike: () => void;
  onNext: () => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onLike}
          aria-pressed={liked}
          aria-label={liked ? "Liked. Remove the heart" : "Like this candidate"}
          title={liked ? "Liked" : "Like"}
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors",
            liked
              ? "border-(--l-lime)/40 bg-(--l-lime)/[0.12] text-(--l-lime)"
              : "border-(--l-line-strong) bg-white/[0.03] text-(--l-fg-muted) hover:bg-white/[0.07] hover:text-(--l-fg)",
          )}
        >
          <HeartIcon aria-hidden className={cn("size-4.5 transition-transform", liked && "scale-110 fill-current")} />
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-(--l-lime) px-4 text-[14px] font-medium text-(--l-on-lime) transition-colors hover:bg-(--l-lime-hover)"
        >
          Next
          <ArrowRightIcon aria-hidden className="size-4" />
        </button>
      </div>
      {!compact && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-(--l-fg-subtle)">
          <span className="inline-flex items-center gap-1">
            <Kbd>→</Kbd> next
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>←</Kbd> back
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>L</Kbd> like
          </span>
        </p>
      )}
    </div>
  );
}
