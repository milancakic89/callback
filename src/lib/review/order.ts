import type { FilterSummary } from "./matches";

// The order of the playlist (features/cv-screening.md). "applied" is the order the applications came
// in; "match" puts the CVs that meet the most required filters first, then the most nice-to-have
// ones, and the ones that weren't checked, or couldn't be read, last. Nobody is hidden or rejected:
// it only changes where each one stands. Ties keep the order they came in, so the list is the same on
// every visit. The playlist, Next and the back key all walk this one order.
export type PlaylistOrder = "applied" | "match";

export function orderApplicants<T extends { id: string }>(
  applicants: readonly T[],
  summaries: ReadonlyMap<string, FilterSummary>,
  order: PlaylistOrder,
): T[] {
  if (order === "applied") return [...applicants];

  const position = new Map(applicants.map((applicant, index) => [applicant.id, index]));
  const rank = (id: string) => (summaries.get(id)?.status === "checked" ? 0 : 1);
  return [...applicants].sort((a, b) => {
    const sa = summaries.get(a.id);
    const sb = summaries.get(b.id);
    return (
      rank(a.id) - rank(b.id) ||
      (sb?.requiredMet ?? 0) - (sa?.requiredMet ?? 0) ||
      (sb?.optionalMet ?? 0) - (sa?.optionalMet ?? 0) ||
      position.get(a.id)! - position.get(b.id)!
    );
  });
}
