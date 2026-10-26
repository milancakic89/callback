import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIp, rateLimit, type RateLimitStore } from "./rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("getClientIp", () => {
  const headers = (forwardedFor?: string) => new Headers(forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor });

  it("takes the last entry, which is the one the reverse proxy appended", () => {
    expect(getClientIp(headers("203.0.113.7"))).toBe("203.0.113.7");
    expect(getClientIp(headers("6.6.6.6, 203.0.113.7"))).toBe("203.0.113.7");
  });

  it("can't be fooled by addresses the client put in front", () => {
    expect(getClientIp(headers("1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.7"))).toBe("203.0.113.7");
  });

  it("trims spaces around the address", () => {
    expect(getClientIp(headers("6.6.6.6 ,   203.0.113.7  "))).toBe("203.0.113.7");
  });

  it("falls back to 'unknown' when there is no usable header", () => {
    expect(getClientIp(headers())).toBe("unknown");
    expect(getClientIp(headers(""))).toBe("unknown");
  });
});

describe("rateLimit with a store", () => {
  function storeReturning(counts: number[], resetAt = 12_345) {
    let call = 0;
    const hit = vi.fn(async () => ({ count: counts[call++], resetAt }));
    const store: RateLimitStore = { hit };
    return { store, hit };
  }

  it("lets requests through up to the limit and refuses the next", async () => {
    const { store } = storeReturning([1, 2, 3]);
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await rateLimit({ key: "k", limit: 2, windowMs: 1000, store }));
    expect(results.map((r) => r.success)).toEqual([true, true, false]);
  });

  it("reports how many are left, never below zero", async () => {
    const { store } = storeReturning([1, 2, 3]);
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await rateLimit({ key: "k", limit: 2, windowMs: 1000, store }));
    expect(results.map((r) => r.remaining)).toEqual([1, 0, 0]);
  });

  it("passes the key and window to the store, and its reset time back", async () => {
    const { store, hit } = storeReturning([1], 99_000);
    const result = await rateLimit({ key: "sign-in:1.2.3.4:me@example.com", limit: 5, windowMs: 900_000, store });
    expect(hit).toHaveBeenCalledWith("sign-in:1.2.3.4:me@example.com", 900_000);
    expect(result.resetAt).toBe(99_000);
  });
});

describe("rateLimit with the in-memory store", () => {
  it("counts per key in a fixed window and starts over when it ends", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00.000Z"));
    const limit = { key: "memory:window", limit: 2, windowMs: 1000 };

    expect((await rateLimit(limit)).success).toBe(true);
    expect((await rateLimit(limit)).success).toBe(true);
    expect((await rateLimit(limit)).success).toBe(false);

    vi.advanceTimersByTime(1001);
    const fresh = await rateLimit(limit);
    expect(fresh.success).toBe(true);
    expect(fresh.remaining).toBe(1);
  });

  it("keeps different keys apart", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00.000Z"));

    expect((await rateLimit({ key: "memory:a", limit: 1, windowMs: 1000 })).success).toBe(true);
    expect((await rateLimit({ key: "memory:a", limit: 1, windowMs: 1000 })).success).toBe(false);
    expect((await rateLimit({ key: "memory:b", limit: 1, windowMs: 1000 })).success).toBe(true);
  });

  it("tells when the current window ends", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00.000Z"));
    const result = await rateLimit({ key: "memory:reset", limit: 5, windowMs: 60_000 });
    expect(result.resetAt).toBe(Date.now() + 60_000);
  });
});
