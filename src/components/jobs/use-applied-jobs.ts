"use client";

import { useState } from "react";
import type { JobListItem } from "@/lib/jobs/types";

export type ApplyResult = { ok: true } | { ok: false; error: string };

// What the table shows of the jobs the visitor has applied to, and the confirm dialog that comes
// first (features/applied.md). `markApplied` is the Server Action that records it, passed in.
// `initialAppliedIds` must be a stable array (the page's, or a constant): the state is re-synced
// whenever its identity changes.
export function useAppliedJobs(
  initialAppliedIds: string[],
  markApplied: (jobId: string) => Promise<ApplyResult>,
) {
  const [appliedIds, setAppliedIds] = useState<Set<string>>(() => new Set(initialAppliedIds));
  const [pendingAppliedId, setPendingAppliedId] = useState<string | null>(null);
  const [appliedErrors, setAppliedErrors] = useState<Record<string, string>>({});
  const [confirmingJob, setConfirmingJob] = useState<JobListItem | null>(null);

  // Next keeps a page mounted (hidden) when you navigate away, so the explorer outlives the visit,
  // and the useState initializer above only ever sees the first props. When the page comes back with
  // fresh server data (a job applied to on /saved-jobs), adopt it, in the same adjust-state-during-
  // render way as `committedFilterKey` in jobs-explorer.tsx.
  const [syncedAppliedIds, setSyncedAppliedIds] = useState(initialAppliedIds);
  if (syncedAppliedIds !== initialAppliedIds) {
    setSyncedAppliedIds(initialAppliedIds);
    setAppliedIds(new Set(initialAppliedIds));
  }

  // Runs after the confirm dialog is accepted. Applying is one-way, so there is no "unapply" path:
  // the ID is added optimistically and only removed again if the Server Action fails.
  async function apply(job: JobListItem) {
    const jobId = job.id;
    setConfirmingJob(null);
    setAppliedErrors((previous) => {
      if (!(jobId in previous)) return previous;
      const rest = { ...previous };
      delete rest[jobId];
      return rest;
    });
    setAppliedIds((previous) => new Set(previous).add(jobId));
    setPendingAppliedId(jobId);

    const result = await markApplied(jobId);

    setPendingAppliedId(null);
    if (!result.ok) {
      setAppliedIds((previous) => {
        const copy = new Set(previous);
        copy.delete(jobId);
        return copy;
      });
      setAppliedErrors((previous) => ({ ...previous, [jobId]: result.error }));
    }
  }

  return {
    appliedIds,
    pendingAppliedId,
    appliedErrors,
    confirmingJob,
    requestApply: setConfirmingJob,
    cancelApply: () => setConfirmingJob(null),
    apply,
  };
}
