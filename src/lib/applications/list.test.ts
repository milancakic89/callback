import { describe, expect, it } from "vitest";
import type { CallbackApplication, CallbackStatus } from "@/lib/cvs/types";
import {
  compareApplications,
  fromCallbackApplication,
  isCallbackItem,
  isOpenItem,
  itemKey,
  mergeApplications,
  statusRank,
  type SortField,
} from "./list";
import type { ApplicationListItem, CallbackApplicationItem, ManualApplicationItem } from "./types";

const manual = (fields: Partial<ManualApplicationItem> = {}): ManualApplicationItem => ({
  kind: "manual",
  jobId: "job-1",
  status: "PENDING",
  appliedAt: "2026-11-01T09:00:00+00:00",
  title: "Backend Engineer",
  companyName: "Beta",
  url: "https://example.com/job",
  active: true,
  ...fields,
});

const stage = (value: CallbackStatus["stage"]): CallbackStatus => ({
  stage: value,
  stepName: value === "STEP" ? "Interview" : null,
  stepDescription: value === "STEP" ? "A short call." : null,
  stageAt: null,
  stepUpdatedAt: null,
});

const callback = (fields: Partial<CallbackApplicationItem> = {}): CallbackApplicationItem => ({
  kind: "callback",
  id: "app-1",
  jobId: "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f",
  appliedAt: "2026-11-02T09:00:00+00:00",
  title: "Product Designer",
  companyName: "Acme",
  state: "active",
  status: stage("APPLIED"),
  ...fields,
});

const application = (fields: Partial<CallbackApplication> = {}): CallbackApplication => ({
  id: "app-1",
  jobId: "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f",
  title: "Product Designer",
  companyName: "Acme",
  appliedAt: "2026-11-02T09:00:00+00:00",
  state: "active",
  cvFileName: "cv.pdf",
  coverLetter: { kind: "text", text: "Hello" },
  status: stage("APPLIED"),
  interview: null,
  ...fields,
});

describe("fromCallbackApplication", () => {
  it("keeps what the table shows and drops the documents", () => {
    const item = fromCallbackApplication(application({ status: stage("STEP") }));

    expect(item).toEqual({
      kind: "callback",
      id: "app-1",
      jobId: "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f",
      appliedAt: "2026-11-02T09:00:00+00:00",
      title: "Product Designer",
      companyName: "Acme",
      state: "active",
      status: stage("STEP"),
    });
    expect(JSON.stringify(item)).not.toContain("cv.pdf");
    expect(JSON.stringify(item)).not.toContain("Hello");
  });

  it("keeps a missing status missing", () => {
    expect(fromCallbackApplication(application({ state: "withdrawn", status: null })).status).toBeNull();
  });
});

describe("mergeApplications", () => {
  it("puts both kinds in one list, the manual ones first", () => {
    const merged = mergeApplications([manual()], [application()]);

    expect(merged.map((item) => item.kind)).toEqual(["manual", "callback"]);
  });

  it("is empty when both are", () => {
    expect(mergeApplications([], [])).toEqual([]);
  });
});

describe("itemKey", () => {
  it("can't clash between kinds, even with the same id", () => {
    expect(itemKey(manual({ jobId: "x" }))).toBe("manual:x");
    expect(itemKey(callback({ id: "x", jobId: "y" }))).toBe("callback:x");
    expect(itemKey(manual({ jobId: "x" }))).not.toBe(itemKey(callback({ id: "x" })));
  });
});

describe("isCallbackItem", () => {
  it("is true only for an application to a job posted on Callback", () => {
    expect(isCallbackItem(callback())).toBe(true);
    expect(isCallbackItem(manual())).toBe(false);
  });

  it("gives the table and the keys the same answer, so a row is never keyed as one kind and drawn as the other", () => {
    // A row without its kind, as an out-of-date server would send it, is a job tracked by hand to both.
    const withoutKind = { ...manual({ jobId: "x" }), kind: undefined } as unknown as ApplicationListItem;

    expect(isCallbackItem(withoutKind)).toBe(false);
    expect(itemKey(withoutKind)).toBe("manual:x");
  });
});

describe("isOpenItem", () => {
  it("is the job's activity for a manual row", () => {
    expect(isOpenItem(manual({ active: true }))).toBe(true);
    expect(isOpenItem(manual({ active: false }))).toBe(false);
  });

  it("is an active application for a Callback row", () => {
    expect(isOpenItem(callback({ state: "active" }))).toBe(true);
    for (const state of ["paused", "withdrawn", "you_withdrew"] as const) {
      expect(isOpenItem(callback({ state })), state).toBe(false);
    }
  });
});

describe("statusRank", () => {
  it("keeps the dropdown's order for a manual row: Pending, no answer, Rejected, Got offer", () => {
    const ranks = (["PENDING", "NO_ANSWER", "REJECTED", "OFFER"] as const).map((status) => statusRank(manual({ status })));
    expect(ranks).toEqual([...ranks].sort((first, second) => first - second));
    expect(new Set(ranks).size).toBe(4);
  });

  it("puts Applied with Pending, a step after them, and Rejected and Got offer with their manual twins", () => {
    expect(statusRank(callback({ status: stage("APPLIED") }))).toBe(statusRank(manual({ status: "PENDING" })));
    expect(statusRank(callback({ status: stage("REJECTED") }))).toBe(statusRank(manual({ status: "REJECTED" })));
    expect(statusRank(callback({ status: stage("OFFER") }))).toBe(statusRank(manual({ status: "OFFER" })));
    expect(statusRank(callback({ status: stage("STEP") }))).toBeGreaterThan(statusRank(manual({ status: "PENDING" })));
    expect(statusRank(callback({ status: stage("STEP") }))).toBeLessThan(statusRank(manual({ status: "NO_ANSWER" })));
  });

  it("puts an application with no status last", () => {
    const none = statusRank(callback({ status: null }));
    for (const item of [manual({ status: "OFFER" }), callback({ status: stage("OFFER") })]) {
      expect(none).toBeGreaterThan(statusRank(item));
    }
  });
});

describe("compareApplications", () => {
  const sorted = (items: ApplicationListItem[], field: SortField) =>
    [...items].sort((first, second) => compareApplications(first, second, field));

  it("sorts both kinds by title, company and date", () => {
    const items = [
      manual({ jobId: "m", title: "Backend Engineer", companyName: "Beta", appliedAt: "2026-11-01T09:00:00+00:00" }),
      callback({ id: "c", title: "Product Designer", companyName: "Acme", appliedAt: "2026-11-02T09:00:00+00:00" }),
    ];

    expect(sorted(items, "title").map(itemKey)).toEqual(["manual:m", "callback:c"]);
    expect(sorted(items, "company").map(itemKey)).toEqual(["callback:c", "manual:m"]);
    expect(sorted(items, "applied").map(itemKey)).toEqual(["manual:m", "callback:c"]);
  });

  it("sorts by status across kinds", () => {
    const items = [
      manual({ jobId: "offer", status: "OFFER" }),
      callback({ id: "none", status: null, state: "withdrawn" }),
      callback({ id: "step", status: stage("STEP") }),
      manual({ jobId: "pending", status: "PENDING" }),
    ];

    expect(sorted(items, "status").map(itemKey)).toEqual(["manual:pending", "callback:step", "manual:offer", "callback:none"]);
  });

  it("compares dates as times, not as text", () => {
    const earlier = manual({ jobId: "a", appliedAt: "2026-11-09T11:00:00+01:00" });
    const later = callback({ id: "b", appliedAt: "2026-11-09T10:30:00+00:00" });

    expect(compareApplications(earlier, later, "applied")).toBeLessThan(0);
  });
});
