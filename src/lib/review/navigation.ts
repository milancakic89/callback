// Moving through a job's applicants on the review screen (features/applicant-review.md). The list is
// in the order the playlist shows it; `viewed` is the company's own mark, set by Next.

type Item = { viewed: boolean };

// Where Next goes from `from`: the first applicant after it that isn't viewed yet, wrapping round to
// the top. `from` itself never counts (Next has just marked it). Null when everyone has been viewed.
export function nextUnviewed(items: readonly Item[], from: number): number | null {
  for (let step = 1; step < items.length; step += 1) {
    const index = (from + step) % items.length;
    if (!items[index].viewed) return index;
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
