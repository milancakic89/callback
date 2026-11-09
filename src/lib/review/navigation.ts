import { stageChoiceKey, type StageChoice } from "./stages";

// Moving through a job's applicants on the review screen (features/applicant-review.md). The list is
// in the order the playlist shows it; `viewed` is the company's own mark, set by Next.

type Item = { viewed: boolean };

export type PlaylistFilter = "all" | "liked";
// "any", or the key of a status option (stageChoiceKey).
export type StageFilter = string;

// Whether the playlist shows an applicant: its All / Liked choice and its status filter together. The
// playlist and Next and ← all ask this, so they can't disagree (features/application-status.md).
export function matchesPlaylist(
  item: { liked: boolean; stage: StageChoice },
  filter: PlaylistFilter,
  stageFilter: StageFilter,
): boolean {
  return (filter === "all" || item.liked) && (stageFilter === "any" || stageChoiceKey(item.stage) === stageFilter);
}

// Where Next goes from `from`: the first applicant after it that isn't viewed yet, wrapping round to
// the top. `from` itself never counts (Next has just marked it). Null when everyone has been viewed.
export function nextUnviewed(items: readonly Item[], from: number): number | null {
  for (let step = 1; step < items.length; step += 1) {
    const index = (from + step) % items.length;
    if (!items[index].viewed) return index;
  }
  return null;
}

// Where Next goes from `from` among the applicants `shown` keeps (the playlist's All or Liked): the
// next one not viewed yet, as above. Once they are all viewed, Next on one that already was (a second
// pass: Start from the top, Show liked, a reload) opens the next one down instead. Null at the end:
// Next has just viewed the last new one, or there is no one further down.
export function nextTarget<T extends Item>(
  items: readonly T[],
  from: number,
  shown: (item: T) => boolean,
): number | null {
  for (let step = 1; step < items.length; step += 1) {
    const index = (from + step) % items.length;
    if (shown(items[index]) && !items[index].viewed) return index;
  }
  if (!items[from]?.viewed) return null;
  for (let index = from + 1; index < items.length; index += 1) {
    if (shown(items[index])) return index;
  }
  return null;
}

// Where ← goes from `from`: the one above it among those `shown` keeps, wrapping round to the
// bottom. Null when there is no other one.
export function previousTarget<T>(items: readonly T[], from: number, shown: (item: T) => boolean): number | null {
  for (let step = 1; step < items.length; step += 1) {
    const index = (from - step + items.length) % items.length;
    if (shown(items[index])) return index;
  }
  return null;
}

// Where the screen opens: the applicant the URL names (a reload keeps the place), else the first one
// not viewed yet, else the first one.
export function initialIndex(items: readonly (Item & { id: string })[], requestedId?: string | null): number {
  if (requestedId) {
    const requested = items.findIndex((item) => item.id === requestedId);
    if (requested !== -1) return requested;
  }
  const unviewed = items.findIndex((item) => !item.viewed);
  return unviewed === -1 ? 0 : unviewed;
}
