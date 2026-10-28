import { describe, expect, it } from "vitest";
import type { CareersResult } from "../types";
import { reusePrevious } from "./careers";

const result = (fields: Partial<CareersResult>): CareersResult => ({
  status: "found",
  careersUrl: "https://acme.example/careers",
  via: "static",
  ats: null,
  atsSlug: null,
  confidence: 0.8,
  candidates: [],
  error: null,
  checkedAt: "2026-09-01T00:00:00.000Z",
  ...fields,
});

const NOW = "2026-10-28T05:00:00.000Z";
const refusal = (error: string) => result({ status: "error", careersUrl: null, via: null, confidence: 0, error, checkedAt: NOW });

// With robots.txt policy as strict as it is (http.ts), a recheck of a company's website is refused
// for hundreds of them. Without this, every one of them would lose its ATS the next time it is
// rechecked, `jobs` would stop reading its public API, and its jobs would sit there stale for good.
describe("reusePrevious, when a recheck of a company's site was refused", () => {
  const greenhouse = result({ ats: "greenhouse", atsSlug: "acme", via: "website" });

  it("keeps what an earlier visit found, with the date of this look", async () => {
    for (const error of ["blocked by robots.txt: Disallow /wp-admin/", "robots.txt not readable: HTTP 403"]) {
      expect(reusePrevious(refusal(error), greenhouse), error).toEqual({ ...greenhouse, checkedAt: NOW });
    }
  });

  it("keeps an ambiguous careers page too", () => {
    const ambiguous = result({ status: "ambiguous" });
    expect(reusePrevious(refusal("blocked by robots.txt: Disallow /x"), ambiguous)).toEqual({ ...ambiguous, checkedAt: NOW });
  });

  it("has nothing to keep when the company was never found, or there is no earlier result", () => {
    const refused = refusal("blocked by robots.txt: Disallow /x");
    expect(reusePrevious(refused, undefined)).toBe(refused);
    expect(reusePrevious(refused, result({ status: "not_found", careersUrl: null }))).toBe(refused);
    expect(reusePrevious(refused, result({ status: "error", error: "website unreachable" }))).toBe(refused);
  });

  it("doesn't hide any other failure: an unreachable site replaces the old result as before", () => {
    const unreachable = result({ status: "error", careersUrl: null, error: "website unreachable: ENOTFOUND", checkedAt: NOW });
    expect(reusePrevious(unreachable, greenhouse)).toBe(unreachable);
  });

  it("leaves a successful recheck alone", () => {
    const fresh = result({ careersUrl: "https://acme.example/jobs", checkedAt: NOW });
    expect(reusePrevious(fresh, greenhouse)).toBe(fresh);
  });
});
