// The reverse proxy appends the real client IP last; entries to its left are client-controlled.
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",").at(-1)?.trim();
  return ip || "unknown";
}

export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

const MAX_MEMORY_ENTRIES = 10_000;
const memoryEntries = new Map<string, { count: number; resetAt: number }>();

export const memoryStore: RateLimitStore = {
  async hit(key, windowMs) {
    const now = Date.now();

    if (memoryEntries.size > MAX_MEMORY_ENTRIES) {
      for (const [entryKey, entry] of memoryEntries) {
        if (entry.resetAt <= now) memoryEntries.delete(entryKey);
      }
    }

    const existing = memoryEntries.get(key);
    if (!existing || existing.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      memoryEntries.set(key, fresh);
      return fresh;
    }

    existing.count += 1;
    return existing;
  },
};

export async function rateLimit({
  key,
  limit,
  windowMs,
  store = memoryStore,
}: {
  key: string;
  limit: number;
  windowMs: number;
  store?: RateLimitStore;
}): Promise<{ success: boolean; remaining: number; resetAt: number }> {
  const { count, resetAt } = await store.hit(key, windowMs);
  return {
    success: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}
