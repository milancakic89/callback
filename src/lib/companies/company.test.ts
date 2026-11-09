import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_ROUTES,
  RESERVED_SLUGS,
  companyHome,
  isLegacyWorkspacePath,
  isValidSlug,
  isWorkspacePath,
  parseCompanySlug,
  slugProblem,
  slugify,
} from "./company";

describe("slugify", () => {
  it("drops diacritics and the legal form", () => {
    expect(slugify("Petrović d.o.o.")).toBe("petrovic");
    expect(slugify("Čačak Softver DOO")).toBe("cacak-softver");
    expect(slugify("Đurđević d. o. o.")).toBe("djurdjevic");
    expect(slugify("Acme LLC")).toBe("acme");
    expect(slugify("Müller GmbH")).toBe("muller");
  });

  it("joins the words with hyphens and drops punctuation", () => {
    expect(slugify("Big  Data & Co.")).toBe("big-data-co");
    expect(slugify("Joe's Pizza")).toBe("joes-pizza");
    expect(slugify("Front-end_Studio")).toBe("front-end-studio");
    expect(slugify("  --Acme--  ")).toBe("acme");
  });

  it("leaves words that only contain a legal form alone", () => {
    expect(slugify("Doodle")).toBe("doodle");
    expect(slugify("Llcorp")).toBe("llcorp");
  });

  it("keeps a name that is nothing but a legal form", () => {
    expect(slugify("d.o.o.")).toBe("doo");
    expect(slugify("LLC")).toBe("llc");
  });

  it("is empty when the name has no Latin letters, so the user types an address", () => {
    expect(slugify("")).toBe("");
    expect(slugify("Петровић")).toBe("");
    expect(slugify("!!!")).toBe("");
  });

  it("is at most 40 characters and never ends in a hyphen", () => {
    const slug = slugify("A".repeat(39) + " bbbbbbbb");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
    expect(slugify("word ".repeat(30)).endsWith("-")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts 3 to 40 of a-z, 0-9 and hyphens", () => {
    for (const slug of ["acme", "abc", "a1b", "petrovic-doo", "a-b-c", "123", "x".repeat(40)]) {
      expect(isValidSlug(slug), slug).toBe(true);
    }
  });

  it("refuses the wrong length", () => {
    for (const slug of ["", "a", "ab", "x".repeat(41)]) {
      expect(slugProblem(slug), JSON.stringify(slug)).toBe("format");
    }
  });

  it("refuses other characters and a hyphen at either end", () => {
    for (const slug of ["-acme", "acme-", "-", "Acme", "ACME", "ac me", "ac_me", "acme.rs", "acme/jobs", "čačak", " acme", "acme\n"]) {
      expect(isValidSlug(slug), JSON.stringify(slug)).toBe(false);
    }
  });

  it("refuses the app's own words", () => {
    for (const slug of ["jobs", "dashboard", "setup", "api", "sign-in", "test", "employer", "admin", "careers", "help", "pricing"]) {
      expect(slugProblem(slug), slug).toBe("reserved");
    }
  });

  it("allows a reserved word inside a longer slug", () => {
    expect(isValidSlug("jobs-board")).toBe(true);
    expect(isValidSlug("my-test")).toBe(true);
  });
});

describe("parseCompanySlug", () => {
  it("keeps a valid slug and nothing else", () => {
    expect(parseCompanySlug("acme")).toBe("acme");
    for (const value of [undefined, null, "", "Acme", "jobs", "-x-", 1, true, {}, ["acme"]]) {
      expect(parseCompanySlug(value), String(value)).toBeNull();
    }
  });
});

describe("companyHome", () => {
  it("is the company's slug as a path", () => {
    expect(companyHome("acme")).toBe("/acme");
  });
});

describe("isWorkspacePath", () => {
  it("is any path under a slug-shaped first segment that isn't an app route", () => {
    for (const path of ["/acme", "/acme/jobs/new", "/acme/jobs/7c9e6679/review", "/foo", "/test", "/employer"]) {
      expect(isWorkspacePath(path), path).toBe(true);
    }
  });

  it("is not the app's own pages", () => {
    for (const path of ["/", "/jobs", "/jobs/7c9e6679", "/dashboard", "/sign-in", "/setup", "/api/health", "/auth/confirm"]) {
      expect(isWorkspacePath(path), path).toBe(false);
    }
  });

  it("is not a file from public/ or something that can't be a slug", () => {
    for (const path of ["/robots.txt", "/media/clip.mp4", "/_next/static/x.js", "/Acme", "/%C4%8Dak"]) {
      expect(isWorkspacePath(path), path).toBe(false);
    }
  });
});

describe("isLegacyWorkspacePath", () => {
  it("knows the two addresses employers had before slugs", () => {
    for (const path of ["/employer", "/employer/jobs/new", "/test", "/test/jobs/new"]) {
      expect(isLegacyWorkspacePath(path), path).toBe(true);
    }
    for (const path of ["/", "/acme", "/testing", "/employers", "/jobs/test"]) {
      expect(isLegacyWorkspacePath(path), path).toBe(false);
    }
  });
});

// The top-level URL segments of src/app, looking through route groups "(name)" and skipping dynamic
// segments "[name]" (a company's slug is one).
function topLevelRoutes(dir: string, atRoot = true): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith("@")) continue;
    if (entry.name.startsWith("(")) routes.push(...topLevelRoutes(join(dir, entry.name), atRoot));
    else if (!entry.name.startsWith("[") && atRoot) routes.push(entry.name);
  }
  return routes;
}

describe("the app's routes", () => {
  const routes = topLevelRoutes(join(process.cwd(), "src/app"));

  it("finds the routes it should", () => {
    for (const route of ["jobs", "dashboard", "sign-in", "api", "setup"]) expect(routes).toContain(route);
  });

  it("are all in APP_ROUTES, so none is mistaken for a company", () => {
    for (const route of routes) expect(APP_ROUTES, route).toContain(route);
  });

  it("are all reserved, so no company can take one", () => {
    for (const route of routes) expect(RESERVED_SLUGS, route).toContain(route);
  });

  it("have no repeats in the reserved list", () => {
    expect(new Set(RESERVED_SLUGS).size).toBe(RESERVED_SLUGS.length);
  });
});

describe("the database's reserved words", () => {
  it("are the same as RESERVED_SLUGS", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261109120000_company_slugs.sql"), "utf8");
    const list = /array\[([^\]]+)\]/.exec(sql)?.[1] ?? "";
    const words = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(words.length).toBeGreaterThan(0);
    expect([...words].sort()).toEqual([...RESERVED_SLUGS].sort());
  });
});
