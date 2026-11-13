"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadDescription, loadDescriptionBundle, type FetchJson } from "@/lib/jobs/load";
import type { JobListItem } from "@/lib/jobs/types";
import type { DescriptionStatus } from "./filter-rule";

type BundleState =
  | { status: "idle" }
  | { status: "error" }
  | { status: "ready"; descriptions: Record<string, string> };

export type DescriptionBundle = {
  // Every description by list id; null until the bundle has arrived.
  descriptions: Record<string, string> | null;
  status: DescriptionStatus;
  retry: () => void;
};

// All the descriptions at once (28 MB), for a filter on the description. Nothing is fetched until
// `wanted`, which is when such a filter has something to look for; from then on it is loaded once,
// and "loading" is what the filter bar and the table show while it comes. `fetchJson` is passed in.
export function useDescriptionBundle(fetchJson: FetchJson, wanted: boolean): DescriptionBundle {
  const [state, setState] = useState<BundleState>({ status: "idle" });
  const requestedRef = useRef(false);

  // Only sets state inside the promise callbacks, never synchronously.
  const load = useCallback(() => {
    requestedRef.current = true;
    loadDescriptionBundle(fetchJson)
      .then((descriptions) => setState({ status: "ready", descriptions }))
      .catch(() => setState({ status: "error" }));
  }, [fetchJson]);

  useEffect(() => {
    if (wanted && !requestedRef.current) load();
  }, [wanted, load]);

  // The filter row's "Retry" button, a click handler: resetting the state here is fine.
  function retry() {
    setState({ status: "idle" });
    load();
  }

  const status: DescriptionStatus = state.status === "idle" ? (wanted ? "loading" : "idle") : state.status;
  return { descriptions: state.status === "ready" ? state.descriptions : null, status, retry };
}

type DescriptionEntry = { status: "ready"; text: string | null } | { status: "error" };

export type OpenJobDescription = {
  description: string | undefined;
  // "ready" with no `description` means the job has none.
  status: DescriptionStatus;
  retry: () => void;
};

// The description of the job whose sheet is open (`job`), fetched on its own when it opens, so a
// visitor who reads a few doesn't download all of them. Once the whole bundle is there the text comes
// from it and nothing is fetched. A text that has been fetched is kept for the next time the sheet
// opens on that job. `fetchJson` is passed in.
export function useJobDescription(
  fetchJson: FetchJson,
  job: JobListItem | null,
  bundle: Pick<DescriptionBundle, "descriptions">,
): OpenJobDescription {
  const [entries, setEntries] = useState<Record<string, DescriptionEntry>>({});
  const inFlightRef = useRef<Set<string>>(new Set());
  const jobId = job?.id ?? null;
  const hasBundle = bundle.descriptions !== null;
  const hasEntry = jobId !== null && jobId in entries;

  // Only sets state inside the promise callbacks, never synchronously.
  const fetchOne = useCallback(
    (listItemId: string) => {
      inFlightRef.current.add(listItemId);
      loadDescription(fetchJson, listItemId)
        .then((text) => setEntries((previous) => ({ ...previous, [listItemId]: { status: "ready", text } })))
        .catch(() => setEntries((previous) => ({ ...previous, [listItemId]: { status: "error" } })))
        .finally(() => inFlightRef.current.delete(listItemId));
    },
    [fetchJson],
  );

  useEffect(() => {
    if (jobId === null || hasBundle || hasEntry || inFlightRef.current.has(jobId)) return;
    fetchOne(jobId);
  }, [jobId, hasBundle, hasEntry, fetchOne]);

  // The sheet's "Retry" button, a click handler: dropping the failed entry here is fine.
  function retry() {
    if (jobId === null) return;
    setEntries((previous) => {
      const rest = { ...previous };
      delete rest[jobId];
      return rest;
    });
    fetchOne(jobId);
  }

  if (jobId === null) return { description: undefined, status: "ready", retry };
  if (bundle.descriptions) return { description: bundle.descriptions[jobId], status: "ready", retry };
  const entry = entries[jobId];
  if (!entry) return { description: undefined, status: "loading", retry };
  if (entry.status === "error") return { description: undefined, status: "error", retry };
  return { description: entry.text ?? undefined, status: "ready", retry };
}
