"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { markApplied, setSaved } from "@/app/(app)/dashboard/actions";
import { buttonVariants } from "@/components/ui/button";
import {
  buildIndex,
  compileRules,
  matchesRules,
  matchesSearch,
  rulesUseField,
  sortJobs,
  type SortDirection,
  type SortField,
} from "@/lib/jobs/filter";
import { decodeFilters, encodeFilters, FILTER_FIELDS, type FilterRule } from "@/lib/jobs/filter-schema";
import { DEFAULT_PAGE_SIZE } from "@/lib/jobs/preview";
import type { JobListItem } from "@/lib/jobs/types";
import { cn } from "cn";
import { ApplyConfirmDialog } from "./apply-confirm-dialog";
import { FilterBar } from "./filter-bar";
import { JobDescriptionSheet } from "./job-description-sheet";
import { JobListError } from "./job-list-error";
import { JobsSearch } from "./jobs-search";
import { JobsTable } from "./jobs-table";
import { useAppliedJobs } from "./use-applied-jobs";
import { useDescriptionBundle, useJobDescription } from "./use-job-descriptions";
import { useJobList } from "./use-job-list";
import { useSavedJobs } from "./use-saved-jobs";

export type JobsExplorerProps = {
  // The whole list, for a page that has it already: /saved-jobs passes the visitor's own, small
  // list. Without it (/jobs and /dashboard) the explorer loads the list from /api/jobs/list when it
  // mounts, and shows `previewRows` until it arrives — see features/performance.md.
  jobs?: JobListItem[];
  // The first page of the table as it opens (newest first) and how many jobs there are in all: what
  // the table shows until the list arrives, as long as nothing has been searched, filtered, sorted
  // or paged. The static fallback (jobs-explorer-fallback.tsx) shows the same rows.
  previewRows?: JobListItem[];
  totalCount?: number;
  // The clock for "3d ago", for a page that passes `jobs` and has the server's time. Without it the
  // time comes from the browser when the list arrives (use-job-list.ts); it is never read while
  // rendering, since the server's prerender and the browser would disagree.
  now?: number;
  showApplied?: boolean;
  initialAppliedIds?: string[];
  // The Save job column (signed-in pages only). See features/saved-jobs.md.
  showSaved?: boolean;
  initialSavedIds?: string[];
  // /saved-jobs: `jobs` is the user's saved jobs (expired ones included), and a job leaves the
  // table the moment its heart is unticked.
  savedOnly?: boolean;
  // When true, this fills its container's height (needs a sized ancestor, e.g. a flex row with
  // h-dvh — see src/app/(app)/dashboard/page.tsx) and only the table's rows scroll internally, instead
  // of the whole page. Search and the filter bar stay fixed above it either way. Only from `md`
  // up: on a phone the rows are tall cards, so the (app) layout's <main> scrolls instead.
  fillHeight?: boolean;
};

const DEFAULT_SORT_FIELD: SortField = "posted";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";
const SORT_FIELDS: SortField[] = ["title", "company", "posted", "workMode"];
// Stable defaults: the resync-from-props checks in the hooks compare the prop by identity, so a
// fresh `[]` per render would reset the state on every render.
const NO_IDS: string[] = [];
const NO_JOBS: JobListItem[] = [];

function parseSort(raw: string | null): { field: SortField; direction: SortDirection } {
  const [field, direction] = (raw ?? "").split(".");
  if (!SORT_FIELDS.includes(field as SortField)) {
    return { field: DEFAULT_SORT_FIELD, direction: DEFAULT_SORT_DIRECTION };
  }
  return { field: field as SortField, direction: direction === "asc" ? "asc" : "desc" };
}

// Owns search, filters, sort and paging; reads the URL once on mount and writes it back on every
// change (via history.replaceState, no navigation). Loads the job list when the page didn't bring
// it, and the descriptions only when they are needed.
// See features/dashboard.md "Key design choices" and "URL format", and features/performance.md.
export function JobsExplorer({
  jobs,
  previewRows,
  totalCount: previewTotalCount,
  now: nowFromPage,
  showApplied = false,
  initialAppliedIds = NO_IDS,
  showSaved = false,
  initialSavedIds = NO_IDS,
  savedOnly = false,
  fillHeight = false,
}: JobsExplorerProps) {
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [rules, setRules] = useState<FilterRule[]>(() => decodeFilters(searchParams.get("f")));
  const [{ field: sort, direction }, setSortState] = useState(() => parseSort(searchParams.get("sort")));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [viewingJob, setViewingJob] = useState<JobListItem | null>(null);

  const jobList = useJobList(fetch, jobs);
  const now = nowFromPage ?? jobList.now;
  const loadedJobs = jobList.jobs ?? NO_JOBS;

  const needsDescriptions = useMemo(() => rulesUseField(rules, "description"), [rules]);
  const descriptionBundle = useDescriptionBundle(fetch, needsDescriptions);
  const openDescription = useJobDescription(fetch, viewingJob, descriptionBundle);
  const descriptionsPending = needsDescriptions && descriptionBundle.status === "loading";

  const applied = useAppliedJobs(initialAppliedIds, markApplied);
  const saved = useSavedJobs(initialSavedIds, setSaved);

  const fields = useMemo(
    () => FILTER_FIELDS.filter((field) => field !== "applied" || showApplied),
    [showApplied],
  );

  // Keeps the URL shareable without triggering a navigation or a server round-trip.
  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search);
    const encoded = encodeFilters(rules);
    if (encoded) params.set("f", encoded);
    if (sort !== DEFAULT_SORT_FIELD || direction !== DEFAULT_SORT_DIRECTION) {
      params.set("sort", `${sort}.${direction}`);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [search, rules, sort, direction]);

  // Resets to page 1 when search/filters/sort change (features/dashboard.md "URL format"), without
  // an effect: compared and applied during render, same as React's docs pattern for "adjusting
  // state when a prop changes" (https://react.dev/learn/you-might-not-need-an-effect).
  const filterKey = `${search}\u0000${encodeFilters(rules) ?? ""}\u0000${sort}\u0000${direction}`;
  const [committedFilterKey, setCommittedFilterKey] = useState(filterKey);
  if (filterKey !== committedFilterKey) {
    setCommittedFilterKey(filterKey);
    setPage(1);
  }

  // Until the list arrives the table shows the preview rows, which are right only for the table as
  // it opens: with a search, a filter, another sort or another page the rows aren't known yet, and
  // the table waits (its skeleton) instead of showing the wrong ones.
  const hasActiveRule = FILTER_FIELDS.some((field) => rulesUseField(rules, field));
  const isOpeningView =
    !search.trim() &&
    !hasActiveRule &&
    sort === DEFAULT_SORT_FIELD &&
    direction === DEFAULT_SORT_DIRECTION &&
    page === 1 &&
    pageSize === DEFAULT_PAGE_SIZE;
  const showingPreview = jobList.jobs === null && previewRows !== undefined && isOpeningView;
  const waitingForList = jobList.jobs === null && !showingPreview;
  const blocked = descriptionsPending || waitingForList;

  const index = useMemo(
    () => buildIndex(loadedJobs, descriptionBundle.descriptions),
    [loadedJobs, descriptionBundle.descriptions],
  );

  const compiled = useMemo(
    () => compileRules(rules, { showApplied, includeDescription: descriptionBundle.status === "ready" }),
    [rules, showApplied, descriptionBundle.status],
  );

  // On /saved-jobs a job leaves the table as soon as its heart is unticked. The index stays built
  // from every job in `jobs`, so toggling a heart doesn't re-normalize all of their text.
  const listedCount = useMemo(() => {
    if (jobList.jobs === null) return previewTotalCount ?? 0;
    return savedOnly ? loadedJobs.filter((job) => saved.savedIds.has(job.id)).length : loadedJobs.length;
  }, [jobList.jobs, previewTotalCount, savedOnly, loadedJobs, saved.savedIds]);

  const matched = useMemo(() => {
    if (blocked) return [];
    const activeAppliedIds = showApplied ? applied.appliedIds : null;
    return index.filter(
      (nj) =>
        (!savedOnly || saved.savedIds.has(nj.job.id)) &&
        matchesSearch(nj, search) &&
        matchesRules(nj, compiled, activeAppliedIds),
    );
  }, [blocked, index, search, compiled, showApplied, applied.appliedIds, savedOnly, saved.savedIds]);

  const sortedJobs = useMemo(
    () => sortJobs(matched.map((nj) => nj.job), sort, direction),
    [matched, sort, direction],
  );
  const matchCount = showingPreview ? listedCount : sortedJobs.length;
  const pageCount = Math.max(1, Math.ceil(matchCount / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const rows = useMemo(
    () => (showingPreview ? (previewRows ?? NO_JOBS) : sortedJobs.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)),
    [showingPreview, previewRows, sortedJobs, clampedPage, pageSize],
  );

  function handleSortChange(field: SortField) {
    setSortState((previous) =>
      previous.field === field
        ? { field, direction: previous.direction === "asc" ? "desc" : "asc" }
        : { field, direction: field === "posted" ? "desc" : "asc" },
    );
  }

  function handleClearFilters() {
    setSearch("");
    setRules([]);
  }

  return (
    <div className={cn("flex flex-col gap-4", fillHeight && "md:h-full md:min-h-0")}>
      <JobsSearch value={search} onChange={setSearch} />
      <FilterBar
        rules={rules}
        fields={fields}
        descriptionStatus={descriptionBundle.status}
        onRulesChange={setRules}
        onRetryDescriptions={descriptionBundle.retry}
      />
      {jobList.status === "error" && <JobListError onRetry={jobList.retry} />}
      <div className={cn(fillHeight && "md:min-h-0 md:flex-1")}>
        <JobsTable
          rows={rows}
          matchCount={matchCount}
          totalCount={listedCount}
          page={clampedPage}
          pageCount={pageCount}
          pageSize={pageSize}
          sort={sort}
          direction={direction}
          showApplied={showApplied}
          appliedIds={applied.appliedIds}
          now={now}
          pendingAppliedId={applied.pendingAppliedId}
          appliedErrors={applied.appliedErrors}
          showSaved={showSaved}
          savedIds={saved.savedIds}
          pendingSavedIds={saved.pendingSavedIds}
          savedErrors={saved.savedErrors}
          loading={blocked}
          scrollable={fillHeight}
          emptyState={
            savedOnly ? (
              <>
                <p className="text-sm text-muted-foreground">You haven&apos;t saved any jobs yet.</p>
                <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
                  Browse jobs
                </Link>
              </>
            ) : undefined
          }
          onSortChange={handleSortChange}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          onRequestApply={applied.requestApply}
          onToggleSaved={saved.toggleSaved}
          onClearFilters={handleClearFilters}
          onViewJob={setViewingJob}
        />
      </div>
      {showApplied && (
        <ApplyConfirmDialog job={applied.confirmingJob} onCancel={applied.cancelApply} onConfirm={applied.apply} />
      )}
      <JobDescriptionSheet
        job={viewingJob}
        description={openDescription.description}
        status={openDescription.status}
        onClose={() => setViewingJob(null)}
        onRetry={openDescription.retry}
      />
    </div>
  );
}
