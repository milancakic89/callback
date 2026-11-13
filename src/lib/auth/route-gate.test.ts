import { describe, expect, it } from "vitest";
import { isWorkspacePath, slugProblem } from "@/lib/companies/company";
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

// The page an invitation email leads to (features/interview-invitations.md) is open to everyone: the
// candidate may have no account, and the token in the address is what lets them in. `interviews` is one
// of the app's own routes, so it is not mistaken for a company's slug.
describe("an interview invitation's page", () => {
  const INTERVIEW_PATHS = ["/interviews/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", "/interviews/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d?t=abc"];

  it("is open to a guest, a candidate and an employer, whatever state their company is in", () => {
    for (const visitor of [guest, candidate, employer, newEmployer]) {
      for (const path of INTERVIEW_PATHS) expect(gateRedirect(path.split("?")[0], visitor), path).toBeNull();
    }
  });

  it("is not a company's workspace", () => {
    expect(isWorkspacePath("/interviews/9a8b7c6d")).toBe(false);
  });

  it("can't be the name of a company", () => {
    expect(slugProblem("interviews")).toBe("reserved");
  });
});

// The Privacy Policy and the Terms (features/legal-pages.md) are open to everyone, signed in or not: a
// Google reviewer reads the policy signed out, and a candidate may open it from the sign-up form. They
// were reserved words but not in APP_ROUTES, so proxy took them for a company's workspace and sent a
// signed-out visitor to /sign-in.
describe("the legal pages", () => {
  const LEGAL_PATHS = ["/privacy", "/terms"];

  it("are open to a guest, a candidate and an employer, whatever state their company is in", () => {
    for (const visitor of [guest, candidate, employer, newEmployer]) {
      for (const path of LEGAL_PATHS) expect(gateRedirect(path, visitor), path).toBeNull();
    }
  });

  it("are not a company's workspace, and no company can be called that", () => {
    for (const path of LEGAL_PATHS) {
      expect(isWorkspacePath(path), path).toBe(false);
      expect(slugProblem(path.slice(1)), path).toBe("reserved");
    }
  });
});
