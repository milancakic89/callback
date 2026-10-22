// Runs fn over items with at most `limit` in flight. Stops taking new items once signal aborts.
// Every call site already catches its own per-item errors (and records them against that item),
// so in practice fn never throws — but that's a convention, not a guarantee. This catch is the
// enforced backstop: one item whose error handling has a bug must not abort every other item's
// work, so it's logged and the loop moves on rather than letting Promise.all reject the whole run.
export async function forEachLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const index = next++;
      try {
        await fn(items[index], index);
      } catch (error) {
        console.error(`Unhandled error on item ${index}:`, error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
