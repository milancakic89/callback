"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { setApplied } from "@/app/dashboard/actions";
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
import { FilterBar } from "./filter-bar";
import type { DescriptionStatus } from "./filter-rule";
import { JobsSearch } from "./jobs-search";
import { JobsTable } from "./jobs-table";

export type JobsExplorerProps = {
  jobs: JobListItem[];
  // The server's clock at request time, for "3d ago" — see the callers (src/app/page.tsx,
  // src/app/dashboard/page.tsx). Not read with `Date.now()` in here: this subtree still renders
  // on the server in dev mode and for any truly dynamic request (useSearchParams only forces it
  // out of the *static build-time* shell, not out of SSR in general), and the server's module
  // instance and the browser's load at a different moment — a module-level timestamp drifts
  // between the two and breaks hydration. A prop computed once per request on the server and
  // passed down hydrates identically on both sides.
  now: number;
  showApplied?: boolean;
  initialAppliedIds?: string[];
};

const DEFAULT_SORT_FIELD: SortField = "posted";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";
const DEFAULT_PAGE_SIZE = 50;
const SORT_FIELDS: SortField[] = ["title", "company", "posted", "workMode"];

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
export function JobsExplorer({ jobs, now, showApplied = false, initialAppliedIds = [] }: JobsExplorerProps) {
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

  const matched = useMemo(() => {
    if (blocked) return [];
    const activeAppliedIds = showApplied ? appliedIds : null;
    return index.filter((nj) => matchesSearch(nj, search) && matchesRules(nj, compiled, activeAppliedIds));
  }, [blocked, index, search, compiled, showApplied, appliedIds]);

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

  async function handleToggleApplied(jobId: string, next: boolean) {
    setAppliedErrors((prev) => {
      if (!(jobId in prev)) return prev;
      const rest = { ...prev };
      delete rest[jobId];
      return rest;
    });
    setAppliedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(jobId);
      else copy.delete(jobId);
      return copy;
    });
    setPendingAppliedId(jobId);

    const result = await setApplied(jobId, next);

    setPendingAppliedId(null);
    if (!result.ok) {
      setAppliedIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(jobId);
        else copy.add(jobId);
        return copy;
      });
      setAppliedErrors((prev) => ({ ...prev, [jobId]: result.error }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <JobsSearch value={search} onChange={setSearch} />
      <FilterBar
        rules={rules}
        fields={fields}
        descriptionStatus={descStatus}
        onRulesChange={setRules}
        onRetryDescriptions={retryDescriptions}
      />
      <JobsTable
        rows={rows}
        matchCount={sortedJobs.length}
        totalCount={jobs.length}
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
        loading={blocked}
        onSortChange={handleSortChange}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onToggleApplied={handleToggleApplied}
        onClearFilters={handleClearFilters}
      />
    </div>
  );
}
