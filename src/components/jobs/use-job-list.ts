"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadJobList, type FetchJson } from "@/lib/jobs/load";
import type { JobListItem } from "@/lib/jobs/types";

export type JobListStatus = "loading" | "ready" | "error";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  // `now` is read when the list arrives, in the promise callback, and never while rendering: a
  // clock read in render differs between the server's prerender and the browser (and
  // Date.now() in a prerender is a build error in Next).
  | { status: "ready"; jobs: JobListItem[]; now: number };

export type JobListLoad = {
  // Null until the list has arrived (or when it couldn't be had).
  jobs: JobListItem[] | null;
  // When the list arrived, for "3d ago"; undefined for a list the page passed in, whose page passes
  // its own `now`.
  now: number | undefined;
  status: JobListStatus;
  retry: () => void;
};

// The job list of /jobs and /dashboard, which the pages don't carry (features/performance.md): it is
// loaded from /api/jobs/list when the explorer mounts. A page that has its list already
// (/saved-jobs, the visitor's own) passes it as `providedJobs` and nothing is fetched. `fetchJson`
// is passed in (the browser's `fetch`), like the loader's.
export function useJobList(fetchJson: FetchJson, providedJobs?: JobListItem[]): JobListLoad {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const requestedRef = useRef(false);
  const mustLoad = providedJobs === undefined;

  // Only sets state inside the promise callbacks (never synchronously), so it is safe to call from
  // the effect below: the state already starts at "loading".
  const load = useCallback(() => {
    requestedRef.current = true;
    loadJobList(fetchJson)
      .then((jobs) => setState({ status: "ready", jobs, now: Date.now() }))
      .catch(() => setState({ status: "error" }));
  }, [fetchJson]);

  useEffect(() => {
    if (mustLoad && !requestedRef.current) load();
  }, [mustLoad, load]);

  // Used by a Retry button (a click handler, not an effect), so resetting to "loading" is fine.
  function retry() {
    setState({ status: "loading" });
    load();
  }

  if (providedJobs) return { jobs: providedJobs, now: undefined, status: "ready", retry };
  if (state.status === "ready") return { jobs: state.jobs, now: state.now, status: "ready", retry };
  return { jobs: null, now: undefined, status: state.status, retry };
}
