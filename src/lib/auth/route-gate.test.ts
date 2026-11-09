import { describe, expect, it } from "vitest";
import { gateRedirect, type Visitor } from "./route-gate";

const guest: Visitor = { isAuthenticated: false, accountType: "candidate", companySlug: null };
const candidate: Visitor = { isAuthenticated: true, accountType: "candidate", companySlug: null };
const employer: Visitor = { isAuthenticated: true, accountType: "employer", companySlug: "acme" };
const newEmployer: Visitor = { isAuthenticated: true, accountType: "employer", companySlug: null };

const WORKSPACE_PATHS = ["/acme", "/acme/jobs/new", "/other", "/other/jobs/7c9e6679/review"];

describe("a guest", () => {
  it("is sent to sign-in from every protected page", () => {
    for (const path of ["/dashboard", "/saved-jobs", "/applications", "/profile", "/reset-password", "/setup", ...WORKSPACE_PATHS, "/test", "/employer"]) {
      expect(gateRedirect(path, guest), path).toBe("/sign-in");
    }
  });

  it("may see the public pages, a posting and files", () => {
    for (const path of ["/", "/jobs", "/jobs/7c9e6679", "/sign-in", "/sign-up", "/forgot-password", "/api/health", "/auth/confirm", "/robots.txt"]) {
      expect(gateRedirect(path, guest), path).toBeNull();
    }
  });
});

describe("a candidate", () => {
  it("is sent to the dashboard from the front pages and the guest-only pages", () => {
    for (const path of ["/", "/jobs", "/sign-in", "/sign-up", "/forgot-password"]) {
      expect(gateRedirect(path, candidate), path).toBe("/dashboard");
    }
  });

  it("is sent to the dashboard from every employer page, the old addresses included", () => {
    for (const path of ["/setup", "/test", "/test/jobs/new", "/employer", ...WORKSPACE_PATHS]) {
      expect(gateRedirect(path, candidate), path).toBe("/dashboard");
    }
  });

  it("keeps their own pages and may open a posting", () => {
    for (const path of ["/dashboard", "/saved-jobs", "/applications", "/profile", "/reset-password", "/jobs/7c9e6679", "/api/health"]) {
      expect(gateRedirect(path, candidate), path).toBeNull();
    }
  });
});

describe("an employer with a company", () => {
  it("is sent to the company's workspace from the front pages and the guest-only pages", () => {
    for (const path of ["/", "/jobs", "/sign-in", "/sign-up", "/forgot-password"]) {
      expect(gateRedirect(path, employer), path).toBe("/acme");
    }
  });

  it("is sent there from the candidate pages, the old addresses and a setup they no longer need", () => {
    for (const path of ["/dashboard", "/saved-jobs", "/applications/x", "/profile", "/test", "/test/jobs/new", "/employer", "/employer/jobs/new", "/setup"]) {
      expect(gateRedirect(path, employer), path).toBe("/acme");
    }
  });

  it("keeps the workspace pages (another company's slug is the page's 404, not proxy's) and may open a posting", () => {
    for (const path of ["/acme", "/acme/jobs/new", "/other", "/jobs/7c9e6679", "/reset-password", "/api/health"]) {
      expect(gateRedirect(path, employer), path).toBeNull();
    }
  });
});

describe("an employer who hasn't set the company up", () => {
  it("goes to the setup screen from everywhere that would be their home", () => {
    for (const path of ["/", "/jobs", "/sign-in", "/dashboard", "/applications", "/test", "/test/jobs/new", "/employer", ...WORKSPACE_PATHS]) {
      expect(gateRedirect(path, newEmployer), path).toBe("/setup");
    }
  });

  it("may stay on the setup screen, open a posting and reset the password", () => {
    for (const path of ["/setup", "/jobs/7c9e6679", "/reset-password", "/api/health"]) {
      expect(gateRedirect(path, newEmployer), path).toBeNull();
    }
  });
});

// A company's public page (features/company-profile.md) is open to everyone and is not a workspace:
// `companies` is one of the app's own routes, not a slug.
describe("a company's public page", () => {
  const PUBLIC_COMPANY_PATHS = ["/companies/acme", "/companies/some-other-company"];

  it("is open to a guest", () => {
    for (const path of PUBLIC_COMPANY_PATHS) expect(gateRedirect(path, guest), path).toBeNull();
  });

  it("is open to a candidate", () => {
    for (const path of PUBLIC_COMPANY_PATHS) expect(gateRedirect(path, candidate), path).toBeNull();
  });

  it("is open to an employer, whether or not their own company is set up", () => {
    for (const path of PUBLIC_COMPANY_PATHS) {
      expect(gateRedirect(path, employer), path).toBeNull();
      expect(gateRedirect(path, newEmployer), path).toBeNull();
    }
  });

  it("keeps the profile editor behind the employer's own side", () => {
    expect(gateRedirect("/acme/profile", guest)).toBe("/sign-in");
    expect(gateRedirect("/acme/profile", candidate)).toBe("/dashboard");
    expect(gateRedirect("/acme/profile", employer)).toBeNull();
    expect(gateRedirect("/acme/profile", newEmployer)).toBe("/setup");
  });
});
