import { describe, expect, it } from "vitest";
import { NATIVE_SOURCE, WORK_MODES, WORK_MODE_LABELS, isNativeJob, jobDate, sourceLabel } from "./types";

describe("isNativeJob", () => {
  it("is true only for jobs posted on Callback", () => {
    expect(isNativeJob({ source: NATIVE_SOURCE })).toBe(true);
    expect(isNativeJob({ source: "callback" })).toBe(true);
    expect(isNativeJob({ source: "greenhouse" })).toBe(false);
    expect(isNativeJob({ source: "Callback" })).toBe(false);
  });
});

describe("sourceLabel", () => {
  it("names the sources that need crediting", () => {
    expect(sourceLabel("callback")).toBe("Callback");
    expect(sourceLabel("himalayas")).toBe("Himalayas");
    expect(sourceLabel("weworkremotely")).toBe("We Work Remotely");
    expect(sourceLabel("companyboards")).toBe("Company careers");
  });

  it("calls everything read off a company's own page 'Company site'", () => {
    for (const source of ["dom", "network", "jsonld"]) expect(sourceLabel(source)).toBe("Company site");
  });

  it("capitalises any other single-word ATS name", () => {
    expect(sourceLabel("greenhouse")).toBe("Greenhouse");
    expect(sourceLabel("ashby")).toBe("Ashby");
  });
});

describe("jobDate", () => {
  it("prefers the posted date and falls back to when the scraper first saw the job", () => {
    expect(jobDate({ postedAt: "2026-10-03T00:00:00.000Z", firstSeenAt: "2026-10-20T00:00:00.000Z" })).toBe("2026-10-03T00:00:00.000Z");
    expect(jobDate({ postedAt: null, firstSeenAt: "2026-10-20T00:00:00.000Z" })).toBe("2026-10-20T00:00:00.000Z");
  });
});

describe("work modes", () => {
  it("have a label each", () => {
    for (const mode of WORK_MODES) expect(WORK_MODE_LABELS[mode].length, mode).toBeGreaterThan(0);
  });
});
