"use client";

import { useState } from "react";
import type { JobListItem } from "@/lib/jobs/types";

export type SaveResult = { ok: true } | { ok: false; error: string };

// What the table shows of the jobs the visitor has saved (the heart column, features/saved-jobs.md).
// `setSaved` is the Server Action that records it, passed in. `initialSavedIds` must be a stable
// array, as for useAppliedJobs.
export function useSavedJobs(
  initialSavedIds: string[],
  setSaved: (jobId: string, saved: boolean) => Promise<SaveResult>,
) {
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(initialSavedIds));
  const [pendingSavedIds, setPendingSavedIds] = useState<Set<string>>(() => new Set());
  const [savedErrors, setSavedErrors] = useState<Record<string, string>>({});

  // Adopts fresh server data when the page comes back (a heart unticked on /saved-jobs); see
  // useAppliedJobs.
  const [syncedSavedIds, setSyncedSavedIds] = useState(initialSavedIds);
  if (syncedSavedIds !== initialSavedIds) {
    setSyncedSavedIds(initialSavedIds);
    setSavedIds(new Set(initialSavedIds));
  }

  // Saving toggles both ways and has no confirm step: the heart flips at once, and flips back with
  // an error tooltip if the Server Action fails.
  async function toggleSaved(job: JobListItem, next: boolean) {
    const jobId = job.id;
    setSavedErrors((previous) => {
      if (!(jobId in previous)) return previous;
      const rest = { ...previous };
      delete rest[jobId];
      return rest;
    });
    setSavedIds((previous) => {
      const copy = new Set(previous);
      if (next) copy.add(jobId);
      else copy.delete(jobId);
      return copy;
    });
    setPendingSavedIds((previous) => new Set(previous).add(jobId));

    const result = await setSaved(jobId, next);

    setPendingSavedIds((previous) => {
      const copy = new Set(previous);
      copy.delete(jobId);
      return copy;
    });
    if (!result.ok) {
      setSavedIds((previous) => {
        const copy = new Set(previous);
        if (next) copy.delete(jobId);
        else copy.add(jobId);
        return copy;
      });
      setSavedErrors((previous) => ({ ...previous, [jobId]: result.error }));
    }
  }

  return { savedIds, pendingSavedIds, savedErrors, toggleSaved };
}
