import { describe, expect, it } from "vitest";
import { APP_ROUTES, isWorkspacePath, slugProblem } from "@/lib/companies/company";
import { LEGAL_LAST_UPDATED, LEGAL_LINKS, LEGAL_OPERATOR } from "./constants";

describe("LEGAL_OPERATOR", () => {
  it("has a contact address that is an e-mail address", () => {
    expect(LEGAL_OPERATOR.contactEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it("has a site address that is an origin, with no trailing slash", () => {
    expect(LEGAL_OPERATOR.siteUrl).toMatch(/^https:\/\/[^/\s]+$/);
  });

  it("names the service, the operator and the country, none of them blank", () => {
    for (const value of [
      LEGAL_OPERATOR.serviceName,
      LEGAL_OPERATOR.operatorName,
      LEGAL_OPERATOR.operatorStatus,
      LEGAL_OPERATOR.country,
    ]) {
      expect(value.trim()).not.toBe("");
    }
  });
});

describe("LEGAL_LAST_UPDATED", () => {
  it("is a date written out, such as 13 November 2026", () => {
    expect(LEGAL_LAST_UPDATED).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
    expect(Number.isNaN(Date.parse(LEGAL_LAST_UPDATED))).toBe(false);
  });
});

// A legal page that proxy takes for a company's workspace is sent to sign-in, and nobody signed out (a
// Google reviewer, say) can read it. That happens to any top-level folder missing from APP_ROUTES.
describe("LEGAL_LINKS", () => {
  const links = Object.values(LEGAL_LINKS);

  it("point at one top-level path each, with a label", () => {
    for (const link of links) {
      expect(link.href).toMatch(/^\/[a-z-]+$/);
      expect(link.label.trim()).not.toBe("");
    }
  });

  it("point at the app's own routes, so none is mistaken for a company's workspace", () => {
    for (const link of links) {
      expect(APP_ROUTES, link.href).toContain(link.href.slice(1));
      expect(isWorkspacePath(link.href), link.href).toBe(false);
    }
  });

  it("can't be the name of a company", () => {
    for (const link of links) expect(slugProblem(link.href.slice(1)), link.href).toBe("reserved");
  });
});
