import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: async () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string) => cookieJar.set(name, value),
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_COOKIE_SECRET: "x".repeat(40) } }));

import { PENDING_NEXT_MAX_LENGTH, readPendingSignup, setPendingSignup } from "./pending-signup";

const JOB = "https://www.linkedin.com/jobs/view/4463907148/";
const TRACK_PATH = `/applications/new?url=${encodeURIComponent(JOB)}&title=Engineer`;
const POSTING_PATH = "/jobs/7c9e6679-7425-40de-944b-e07fc1f90ae7?apply=1";

beforeEach(() => cookieJar.clear());

describe("the pending sign-up's `next`", () => {
  it("keeps a posting's path", async () => {
    await setPendingSignup({ uid: "user-1", email: "ana@example.com", next: POSTING_PATH });

    expect(await readPendingSignup()).toEqual({ uid: "user-1", email: "ana@example.com", next: POSTING_PATH });
  });

  it("keeps the page the browser extension opens", async () => {
    await setPendingSignup({ uid: "user-1", email: "ana@example.com", next: TRACK_PATH });

    expect(await readPendingSignup()).toMatchObject({ next: TRACK_PATH });
  });

  it("drops any other path when it is read", async () => {
    await setPendingSignup({ uid: "user-1", email: "ana@example.com", next: "/dashboard" });

    expect(await readPendingSignup()).toEqual({ uid: "user-1", email: "ana@example.com", next: null });
  });

  it("leaves out a `next` too long for a cookie, and keeps the rest", async () => {
    const longTitle = "ć".repeat(200);
    const longPath = `${TRACK_PATH}&company=${encodeURIComponent(longTitle)}&location=${encodeURIComponent(longTitle)}&pad=${"a".repeat(PENDING_NEXT_MAX_LENGTH)}`;
    await setPendingSignup({ uid: "user-1", email: "ana@example.com", next: longPath });

    expect(await readPendingSignup()).toEqual({ uid: "user-1", email: "ana@example.com", next: null });
    expect([...cookieJar.values()][0].length).toBeLessThan(2000);
  });

  it("is null for a decoy with no `next`", async () => {
    await setPendingSignup({ uid: null, email: "ana@example.com", next: null });

    expect(await readPendingSignup()).toEqual({ uid: null, email: "ana@example.com", next: null });
  });
});
