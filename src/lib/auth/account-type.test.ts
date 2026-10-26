import { describe, expect, it } from "vitest";
import { TEST_COMPANY } from "@/lib/companies/company";
import { ACCOUNT_TYPES, homeFor, parseAccountType } from "./account-type";

describe("parseAccountType", () => {
  it("accepts the two account types", () => {
    expect(parseAccountType("employer")).toBe("employer");
    expect(parseAccountType("candidate")).toBe("candidate");
  });

  it("treats anything else as a candidate, the side with less access", () => {
    for (const value of [undefined, null, "", "admin", "EMPLOYER", "Employer", 1, true, {}, ["employer"]]) {
      expect(parseAccountType(value), String(value)).toBe("candidate");
    }
  });
});

describe("homeFor", () => {
  it("sends a candidate to the dashboard", () => {
    expect(homeFor("candidate")).toBe("/dashboard");
  });

  it("sends an employer to their company's workspace", () => {
    expect(homeFor("employer")).toBe(`/${TEST_COMPANY.slug}`);
  });

  it("has a home for every account type", () => {
    for (const type of ACCOUNT_TYPES) expect(homeFor(type).startsWith("/"), type).toBe(true);
  });
});
