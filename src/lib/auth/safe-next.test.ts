import { describe, expect, it } from "vitest";
import { postingNext, safeNext } from "./safe-next";

const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("safeNext", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/reset-password", "/dashboard")).toBe("/reset-password");
    expect(safeNext(`/jobs/${ID}`, "/dashboard")).toBe(`/jobs/${ID}`);
  });

  it("falls back for another site, a protocol-relative URL or nothing", () => {
    for (const next of ["//evil.example", "/\\evil.example", "https://evil.example", "evil.example", "", null, undefined]) {
      expect(safeNext(next, "/dashboard"), String(next)).toBe("/dashboard");
    }
  });
});

describe("postingNext", () => {
  it("accepts a posting's path only", () => {
    expect(postingNext(`/jobs/${ID}`)).toBe(`/jobs/${ID}`);
    expect(postingNext(`/jobs/${ID.toUpperCase()}`)).toBe(`/jobs/${ID.toUpperCase()}`);
  });

  it("accepts the posting with its apply dialog open, and no other query", () => {
    expect(postingNext(`/jobs/${ID}?apply=1`)).toBe(`/jobs/${ID}?apply=1`);
    for (const next of [
      `/jobs/${ID}?apply=0`,
      `/jobs/${ID}?apply=1&next=//evil.example`,
      `/jobs/${ID}?apply=1#x`,
      `/jobs/${ID}?apply=11`,
      `/jobs/${ID}?Apply=1x`,
      `/jobs/${ID}/?apply=1`,
      `/jobs?apply=1`,
    ]) {
      expect(postingNext(next), next).toBeNull();
    }
  });

  it("refuses every other path, so a sign-in can't be pointed anywhere else", () => {
    for (const next of [
      "/dashboard",
      "/jobs",
      "/jobs/",
      "/jobs/new",
      "/jobs/callback:abc",
      `/jobs/${ID}/`,
      `/jobs/${ID}/extra`,
      `/jobs/${ID}?x=1`,
      `/jobs/${ID}#top`,
      `//jobs/${ID}`,
      `/\\jobs/${ID}`,
      `https://evil.example/jobs/${ID}`,
      `/jobs/${ID}\n`,
      "/acme/jobs/new",
      "/auth/confirm",
      "",
      null,
      undefined,
      42,
      {},
    ]) {
      expect(postingNext(next), String(next)).toBeNull();
    }
  });
});
