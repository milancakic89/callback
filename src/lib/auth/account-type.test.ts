import { describe, expect, it } from "vitest";
import { ACCOUNT_TYPES, homeFor, parseAccountType, SETUP_PATH } from "./account-type";

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
  it("sends a candidate to the dashboard, whatever the slug", () => {
    expect(homeFor("candidate", null)).toBe("/dashboard");
    expect(homeFor("candidate", "acme")).toBe("/dashboard");
  });

  it("sends an employer to their company's workspace", () => {
    expect(homeFor("employer", "acme")).toBe("/acme");
    expect(homeFor("employer", "petrovic-doo")).toBe("/petrovic-doo");
  });

  it("sends an employer without a company address to the setup screen", () => {
    expect(homeFor("employer", null)).toBe("/setup");
    expect(SETUP_PATH).toBe("/setup");
  });

  it("has a home for every account type", () => {
    for (const type of ACCOUNT_TYPES) {
      expect(homeFor(type, null).startsWith("/"), type).toBe(true);
      expect(homeFor(type, "acme").startsWith("/"), type).toBe(true);
    }
  });
});
