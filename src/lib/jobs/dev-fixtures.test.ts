import { afterEach, describe, expect, it, vi } from "vitest";
import { isNativeJob } from "./types";

// dev-fixtures.ts reads NODE_ENV once, when it is first imported, so each case loads a fresh copy.
async function loadFixturesFor(nodeEnv: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.resetModules();
  return import("./dev-fixtures");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the fictional Callback job", () => {
  it("is not added in production, so visitors never see a fake posting", async () => {
    const { DEV_NATIVE_JOB_ITEMS, DEV_NATIVE_JOB_DESCRIPTIONS } = await loadFixturesFor("production");
    expect(DEV_NATIVE_JOB_ITEMS).toEqual([]);
    expect(DEV_NATIVE_JOB_DESCRIPTIONS).toEqual({});
  });

  it("is not added under test either", async () => {
    const { DEV_NATIVE_JOB_ITEMS } = await loadFixturesFor("test");
    expect(DEV_NATIVE_JOB_ITEMS).toEqual([]);
  });

  it("is added in development, as a native job with a description", async () => {
    const { DEV_NATIVE_JOB_ITEMS, DEV_NATIVE_JOB_DESCRIPTIONS } = await loadFixturesFor("development");
    expect(DEV_NATIVE_JOB_ITEMS).toHaveLength(1);
    const [fixture] = DEV_NATIVE_JOB_ITEMS;
    expect(isNativeJob(fixture)).toBe(true);
    expect(fixture.url).toBeNull();
    expect(DEV_NATIVE_JOB_DESCRIPTIONS[fixture.id]).toBeTruthy();
  });
});
