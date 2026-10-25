"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { JobListItem } from "@/lib/jobs/types";
import { cn } from "cn";
import { ApplyConfirmDialog } from "./apply-confirm-dialog";
import { FilterBar } from "./filter-bar";
import type { DescriptionStatus } from "./filter-rule";
import { JobDescriptionSheet } from "./job-description-sheet";
import { JobsSearch } from "./jobs-search";
import { JobsTable } from "./jobs-table";

export type JobsExplorerProps = {
  jobs: JobListItem[];
  // The server's clock at request time, for "3d ago" — see the callers (src/app/page.tsx,
  // src/app/(app)/dashboard/page.tsx). Not read with `Date.now()` in here: this subtree still renders
  // on the server in dev mode and for any truly dynamic request (useSearchParams only forces it
  // out of the *static build-time* shell, not out of SSR in general), and the server's module
  // instance and the browser's load at a different moment — a module-level timestamp drifts
  // between the two and breaks hydration. A prop computed once per request on the server and
  // passed down hydrates identically on both sides.
  now: number;
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
const DEFAULT_PAGE_SIZE = 20;
const SORT_FIELDS: SortField[] = ["title", "company", "posted", "workMode"];
// A stable default: the resync-from-props checks below compare the prop by identity, so a fresh
// `[]` per render would reset the state on every render.
const NO_IDS: string[] = [];

function parseSort(raw: string | null): { field: SortField; direction: SortDirection } {
  const [field, direction] = (raw ?? "").split(".");
  if (!SORT_FIELDS.includes(field as SortField)) {
    return { field: DEFAULT_SORT_FIELD, direction: DEFAULT_SORT_DIRECTION };
  }
  return { field: field as SortField, direction: direction === "asc" ? "asc" : "desc" };
}

// Owns search, filters, sort and paging; reads the URL once on mount and writes it back on every
// change (via history.replaceState, no navigation). Loads descriptions in the background.
// See features/dashboard.md "Key design choices" and "URL format".
export function JobsExplorer({
  jobs,
  now,
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

  const [descriptions, setDescriptions] = useState<Record<string, string> | null>(null);
  const [descStatus, setDescStatus] = useState<DescriptionStatus>("loading");

  const [appliedIds, setAppliedIds] = useState<Set<string>>(() => new Set(initialAppliedIds));
  const [pendingAppliedId, setPendingAppliedId] = useState<string | null>(null);
  const [appliedErrors, setAppliedErrors] = useState<Record<string, string>>({});
  const [confirmingJob, setConfirmingJob] = useState<JobListItem | null>(null);
  const [viewingJob, setViewingJob] = useState<JobListItem | null>(null);

  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(initialSavedIds));
  const [pendingSavedIds, setPendingSavedIds] = useState<Set<string>>(() => new Set());
  const [savedErrors, setSavedErrors] = useState<Record<string, string>>({});

  // Next keeps a page mounted (hidden) when you navigate away, so this component outlives the
  // visit, and the useState initializers above only ever see the first props. When the page
  // comes back with fresh server data (a heart unticked on /saved-jobs, a job applied to there),
  // adopt it, in the same adjust-state-during-render way as `committedFilterKey` below.
  const [syncedAppliedIds, setSyncedAppliedIds] = useState(initialAppliedIds);
  if (syncedAppliedIds !== initialAppliedIds) {
    setSyncedAppliedIds(initialAppliedIds);
    setAppliedIds(new Set(initialAppliedIds));
  }
  const [syncedSavedIds, setSyncedSavedIds] = useState(initialSavedIds);
  if (syncedSavedIds !== initialSavedIds) {
    setSyncedSavedIds(initialSavedIds);
    setSavedIds(new Set(initialSavedIds));
  }

  const fields = useMemo(
    () => FILTER_FIELDS.filter((field) => field !== "applied" || showApplied),
    [showApplied],
  );

  // Only sets state inside the promise callbacks (never synchronously), so this is safe to call
  // straight from the mount effect below — descStatus already starts at "loading".
  const fetchDescriptions = useCallback(() => {
    fetch("/api/jobs/descriptions")
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<Record<string, string>>;
      })
      .then((data) => {
        setDescriptions(data);
        setDescStatus("ready");
      })
      .catch(() => setDescStatus("error"));
  }, []);

  useEffect(() => {
    fetchDescriptions();
  }, [fetchDescriptions]);

  // Used by the filter row's "Retry" button (a click handler, not an effect), so resetting to
  // "loading" synchronously here is fine.
  function retryDescriptions() {
    setDescStatus("loading");
    fetchDescriptions();
  }

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

  const index = useMemo(() => buildIndex(jobs, descriptions), [jobs, descriptions]);
  const needsDescriptions = useMemo(() => rulesUseField(rules, "description"), [rules]);
  const blocked = needsDescriptions && descStatus === "loading";

  const compiled = useMemo(
    () => compileRules(rules, { showApplied, includeDescription: descStatus === "ready" }),
    [rules, showApplied, descStatus],
  );

  // On /saved-jobs a job leaves the table as soon as its heart is unticked. The index stays built
  // from every job in `jobs`, so toggling a heart doesn't re-normalize all of their text.
  const totalCount = useMemo(
    () => (savedOnly ? jobs.filter((job) => savedIds.has(job.id)).length : jobs.length),
    [savedOnly, jobs, savedIds],
  );

  const matched = useMemo(() => {
    if (blocked) return [];
    const activeAppliedIds = showApplied ? appliedIds : null;
    return index.filter(
      (nj) =>
        (!savedOnly || savedIds.has(nj.job.id)) &&
        matchesSearch(nj, search) &&
        matchesRules(nj, compiled, activeAppliedIds),
    );
  }, [blocked, index, search, compiled, showApplied, appliedIds, savedOnly, savedIds]);

  const sortedJobs = useMemo(
    () => sortJobs(matched.map((nj) => nj.job), sort, direction),
    [matched, sort, direction],
  );
  const pageCount = Math.max(1, Math.ceil(sortedJobs.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const rows = useMemo(
    () => sortedJobs.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [sortedJobs, clampedPage, pageSize],
  );

  function handleSortChange(field: SortField) {
    setSortState((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: field === "posted" ? "desc" : "asc" },
    );
  }

  function handleClearFilters() {
    setSearch("");
    setRules([]);
  }

  // Runs after the confirm dialog is accepted. Applying is one-way, so there is no "unapply" path:
  // the ID is added optimistically and only removed again if the Server Action fails.
  async function handleApply(job: JobListItem) {
    const jobId = job.id;
    setConfirmingJob(null);
    setAppliedErrors((prev) => {
      if (!(jobId in prev)) return prev;
      const rest = { ...prev };
      delete rest[jobId];
      return rest;
    });
    setAppliedIds((prev) => new Set(prev).add(jobId));
    setPendingAppliedId(jobId);

    const result = await markApplied(jobId);

    setPendingAppliedId(null);
    if (!result.ok) {
      setAppliedIds((prev) => {
        const copy = new Set(prev);
        copy.delete(jobId);
        return copy;
      });
      setAppliedErrors((prev) => ({ ...prev, [jobId]: result.error }));
    }
  }

  // Saving toggles both ways and has no confirm step: the heart flips at once, and flips back
  // with an error tooltip if the Server Action fails. Same shape as handleApply above.
  async function handleToggleSaved(job: JobListItem, next: boolean) {
    const jobId = job.id;
    setSavedErrors((prev) => {
      if (!(jobId in prev)) return prev;
      const rest = { ...prev };
      delete rest[jobId];
      return rest;
    });
    setSavedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(jobId);
      else copy.delete(jobId);
      return copy;
    });
    setPendingSavedIds((prev) => new Set(prev).add(jobId));

    const result = await setSaved(jobId, next);

    setPendingSavedIds((prev) => {
      const copy = new Set(prev);
      copy.delete(jobId);
      return copy;
    });
    if (!result.ok) {
      setSavedIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(jobId);
        else copy.add(jobId);
        return copy;
      });
      setSavedErrors((prev) => ({ ...prev, [jobId]: result.error }));
    }
  }

  return (
    <div className={cn("flex flex-col gap-4", fillHeight && "md:h-full md:min-h-0")}>
      <JobsSearch value={search} onChange={setSearch} />
      <FilterBar
        rules={rules}
        fields={fields}
        descriptionStatus={descStatus}
        onRulesChange={setRules}
        onRetryDescriptions={retryDescriptions}
      />
      <div className={cn(fillHeight && "md:min-h-0 md:flex-1")}>
        <JobsTable
          rows={rows}
          matchCount={sortedJobs.length}
          totalCount={totalCount}
          page={clampedPage}
          pageCount={pageCount}
          pageSize={pageSize}
          sort={sort}
          direction={direction}
          showApplied={showApplied}
          appliedIds={appliedIds}
          now={now}
          pendingAppliedId={pendingAppliedId}
          appliedErrors={appliedErrors}
          showSaved={showSaved}
          savedIds={savedIds}
          pendingSavedIds={pendingSavedIds}
          savedErrors={savedErrors}
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
          onRequestApply={setConfirmingJob}
          onToggleSaved={handleToggleSaved}
          onClearFilters={handleClearFilters}
          onViewJob={setViewingJob}
        />
      </div>
      {showApplied && (
        <ApplyConfirmDialog
          job={confirmingJob}
          onCancel={() => setConfirmingJob(null)}
          onConfirm={handleApply}
        />
      )}
      <JobDescriptionSheet
        job={viewingJob}
        description={viewingJob ? descriptions?.[viewingJob.id] : undefined}
        status={descStatus}
        onClose={() => setViewingJob(null)}
        onRetry={retryDescriptions}
      />
    </div>
  );
}
