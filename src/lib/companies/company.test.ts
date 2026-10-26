import { describe, expect, it } from "vitest";
import { TEST_COMPANY, companyHome, getCompanyBySlug } from "./company";

describe("getCompanyBySlug", () => {
  it("finds the company by its exact slug", () => {
    expect(getCompanyBySlug("test")).toBe(TEST_COMPANY);
  });

  it("knows no other slug, so anything else is a 404", () => {
    for (const slug of ["foo", "", "Test", "TEST", " test", "test/", "jobs", "dashboard"]) {
      expect(getCompanyBySlug(slug), JSON.stringify(slug)).toBeNull();
    }
  });
});

describe("companyHome", () => {
  it("is the company's slug as a path", () => {
    expect(companyHome(TEST_COMPANY)).toBe("/test");
  });
});
