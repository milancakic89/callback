"use client";

import { useMemo, useState } from "react";
import { applyApplicationStages, setApplicationStage } from "@/app/(employer)/[company]/actions";
import {
  initialStageStates,
  pendingStageChanges,
  revertStage,
  withApplied,
  withStage,
  type PendingStageChange,
  type StageStates,
} from "@/lib/review/pending-stages";
import { sameChoice, type StageChoice } from "@/lib/review/stages";
import type { ApplyOutcome } from "./apply-stages-button";

// The statuses of a job's applicants on the review screen (features/candidate-steps.md): the employer's
// choice and what the candidate has been shown, for each. A choice shows at once and is saved in the
// background, and put back with a note if saving fails; "Apply statuses" then shows the pending ones to
// the candidates. The state moves are in src/lib/review/pending-stages.ts, where they are tested.
export function useStageChanges({
  applicants,
  people,
  jobId,
  onNotice,
}: {
  applicants: readonly { id: string; stage: StageChoice; candidateStage: StageChoice }[];
  // The applicants in the order the playlist shows them: the pending list follows it.
  people: readonly { id: string; name: string }[];
  jobId: string;
  onNotice: (message: string) => void;
}) {
  const [states, setStates] = useState<StageStates>(() => initialStageStates(applicants));
  const pending = useMemo(() => pendingStageChanges(states, people), [states, people]);

  function changeStage(id: string, choice: StageChoice) {
    const previous = states[id]?.stage;
    if (!previous || sameChoice(previous, choice)) return;
    setStates((all) => withStage(all, id, choice));
    // Put back only if nothing newer was chosen while this was saving.
    const putBack = (message: string) => {
      setStates((all) => revertStage(all, id, choice, previous));
      onNotice(message);
    };
    setApplicationStage(id, choice).then(
      (result) => {
        if (!result.ok) putBack(result.error);
      },
      () => putBack("Could not save. Check your connection."),
    );
  }

  async function applyChanges(changes: PendingStageChange[]): Promise<ApplyOutcome> {
    try {
      const result = await applyApplicationStages(
        jobId,
        changes.map((change) => ({ id: change.id, stage: change.to.stage, stepId: change.to.stepId })),
      );
      if (!result.ok) return result;
      const applied = changes.filter((change) => result.appliedIds.includes(change.id));
      setStates((all) => withApplied(all, applied));
      const skipped = changes.length - applied.length;
      // An application the employer changed again elsewhere since the confirmation opened is not sent.
      if (skipped > 0) onNotice(`${skipped} changed in the meantime and ${skipped === 1 ? "was" : "were"} not applied.`);
      return { ok: true, skipped };
    } catch {
      return { ok: false, error: "Could not apply the statuses. Check your connection." };
    }
  }

  return { states, pending, changeStage, applyChanges };
}
