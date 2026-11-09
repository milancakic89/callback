import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  COMPANY_SIZE_LABELS,
  COMPANY_SIZES,
  companyCacheTag,
  companyFacts,
  companyProfileEditPath,
  companyProfilePath,
  companyProfileSchema,
  hasCompanyDetails,
  HEADQUARTERS_MAX,
  INDUSTRY_MAX,
  isCompanySize,
  normalizeWebsite,
  previewProfile,
  PROFILE_DESCRIPTION_MAX,
  toCompanyProfile,
  WEBSITE_MAX,
  websiteLabel,
  type CompanyProfile,
} from "./profile";

const empty = { description: "", website: "", industry: "", size: "", headquarters: "" };

function errorsOf(input: Record<string, unknown>) {
  const result = companyProfileSchema.safeParse({ ...empty, ...input });
  if (result.success) throw new Error("expected the input to be refused");
  return z.flattenError(result.error).fieldErrors;
}

const PROFILE: CompanyProfile = {
  name: "Acme d.o.o.",
  slug: "acme",
  description: "We make clinics run on time.",
  website: "https://www.acme.com/about",
  industry: "Healthcare software",
  size: "51-200",
  headquarters: "Belgrade, Serbia",
};

describe("companyProfileSchema", () => {
  it("accepts a profile with nothing filled in, and stores every field as null", () => {
    expect(companyProfileSchema.parse(empty)).toEqual({
      description: null,
      website: null,
      industry: null,
      size: null,
      headquarters: null,
    });
  });

  it("trims the text and stores line breaks as one character", () => {
    const parsed = companyProfileSchema.parse({
      ...empty,
      description: "  First line\r\nSecond line  ",
      industry: "  Fintech ",
      headquarters: " Novi Sad ",
    });
    expect(parsed.description).toBe("First line\nSecond line");
    expect(parsed.industry).toBe("Fintech");
    expect(parsed.headquarters).toBe("Novi Sad");
  });

  it("accepts every size in the list, and refuses another", () => {
    for (const size of COMPANY_SIZES) expect(companyProfileSchema.parse({ ...empty, size }).size).toBe(size);
    expect(Object.keys(errorsOf({ size: "huge" }))).toEqual(["size"]);
  });

  it("refuses text over each limit, naming the field", () => {
    expect(Object.keys(errorsOf({ description: "x".repeat(PROFILE_DESCRIPTION_MAX + 1) }))).toEqual(["description"]);
    expect(Object.keys(errorsOf({ industry: "x".repeat(INDUSTRY_MAX + 1) }))).toEqual(["industry"]);
    expect(Object.keys(errorsOf({ headquarters: "x".repeat(HEADQUARTERS_MAX + 1) }))).toEqual(["headquarters"]);
    expect(companyProfileSchema.safeParse({ ...empty, description: "x".repeat(PROFILE_DESCRIPTION_MAX) }).success).toBe(true);
  });

  it("adds https:// to a website typed without a scheme", () => {
    expect(companyProfileSchema.parse({ ...empty, website: " acme.com " }).website).toBe("https://acme.com");
    expect(companyProfileSchema.parse({ ...empty, website: "http://acme.com/x" }).website).toBe("http://acme.com/x");
  });

  it("refuses a website that is not a plain http(s) address", () => {
    for (const website of ["javascript:alert(1)", "ftp://acme.com", "mailto:hello@acme.com", "data:text/html,x", "localhost", "not a site"]) {
      expect(Object.keys(errorsOf({ website })), website).toEqual(["website"]);
    }
  });

  it("counts the length of a website after https:// is added", () => {
    // Exactly WEBSITE_MAX characters once "https://" is in front, so one more is too many.
    const host = `${"a".repeat(WEBSITE_MAX - "https://.com".length)}.com`;
    expect(`https://${host}`).toHaveLength(WEBSITE_MAX);
    expect(companyProfileSchema.safeParse({ ...empty, website: host }).success).toBe(true);
    expect(Object.keys(errorsOf({ website: `${host}x` }))).toEqual(["website"]);
  });
});

describe("normalizeWebsite", () => {
  it("gives null for empty and blank input", () => {
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite("   ")).toBeNull();
  });

  it("keeps a port and a path", () => {
    expect(normalizeWebsite("acme.com:8080/jobs")).toBe("https://acme.com:8080/jobs");
  });

  it("refuses an address with a name and password in it", () => {
    expect(normalizeWebsite("https://user:pass@acme.com")).toBeNull();
  });
});

describe("toCompanyProfile", () => {
  it("maps the columns, and drops one it doesn't know", () => {
    const row = { ...PROFILE, id: "secret-id", owner_id: "secret-owner" };
    expect(toCompanyProfile(row)).toEqual(PROFILE);
  });

  it("drops a size the code doesn't know", () => {
    expect(toCompanyProfile({ ...PROFILE, size: "5000+" }).size).toBeNull();
  });
});

describe("company sizes", () => {
  it("have a label each, and isCompanySize knows them", () => {
    for (const size of COMPANY_SIZES) {
      expect(COMPANY_SIZE_LABELS[size]).toContain("employees");
      expect(isCompanySize(size)).toBe(true);
    }
    expect(isCompanySize("huge")).toBe(false);
    expect(isCompanySize(null)).toBe(false);
  });

  it("are the same as the database's company_size enum", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261109160000_company_profiles.sql"), "utf8");
    const list = /create type public\.company_size as enum \(([^)]+)\)/.exec(sql)?.[1] ?? "";
    const values = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(values).toEqual([...COMPANY_SIZES]);
  });
});

describe("websiteLabel", () => {
  it("shows the host without www and without the path", () => {
    expect(websiteLabel("https://www.acme.com/careers")).toBe("acme.com");
    expect(websiteLabel("http://shop.acme.com")).toBe("shop.acme.com");
  });

  it("falls back to the text when it is not an address", () => {
    expect(websiteLabel("acme")).toBe("acme");
  });
});

describe("companyFacts", () => {
  it("lists the facts in a fixed order, with the website as a link", () => {
    expect(companyFacts(PROFILE)).toEqual([
      { label: "Industry", value: "Healthcare software" },
      { label: "Company size", value: "51-200 employees" },
      { label: "Headquarters", value: "Belgrade, Serbia" },
      { label: "Website", value: "acme.com", href: "https://www.acme.com/about" },
    ]);
  });

  it("leaves out what isn't filled in", () => {
    const sparse = { ...PROFILE, industry: null, size: null, website: null };
    expect(companyFacts(sparse)).toEqual([{ label: "Headquarters", value: "Belgrade, Serbia" }]);
  });
});

describe("hasCompanyDetails", () => {
  const bare: CompanyProfile = { ...PROFILE, description: null, website: null, industry: null, size: null, headquarters: null };

  it("is false when only the name is known", () => {
    expect(hasCompanyDetails(bare)).toBe(false);
  });

  it("is true with a description alone, or with a fact alone", () => {
    expect(hasCompanyDetails({ ...bare, description: "We build things." })).toBe(true);
    expect(hasCompanyDetails({ ...bare, size: "1-10" })).toBe(true);
  });
});

describe("previewProfile", () => {
  const company = { name: "Acme", slug: "acme" };
  const blankDraft = { description: "", website: "", industry: "", size: null, headquarters: "" };

  it("is empty for an empty form", () => {
    expect(previewProfile(company, blankDraft)).toEqual({
      name: "Acme",
      slug: "acme",
      description: null,
      website: null,
      industry: null,
      size: null,
      headquarters: null,
    });
  });

  it("trims what was typed, and shows a website only once it is usable", () => {
    const draft = { description: "  We build.  ", website: "acme.com", industry: " SaaS ", size: "11-50" as const, headquarters: " Niš " };
    expect(previewProfile(company, draft)).toMatchObject({
      description: "We build.",
      website: "https://acme.com",
      industry: "SaaS",
      size: "11-50",
      headquarters: "Niš",
    });
    expect(previewProfile(company, { ...draft, website: "acme" }).website).toBeNull();
  });
});

describe("paths and tag", () => {
  it("point at the public page, the editor and the cache entry of a company", () => {
    expect(companyProfilePath("acme")).toBe("/companies/acme");
    expect(companyProfileEditPath("acme")).toBe("/acme/profile");
    expect(companyCacheTag("acme")).toBe("company:acme");
  });
});

// An owner saving the profile is an `update` of their row, and Postgres runs every CHECK constraint of
// a row on an update. `companies_slug_valid` calls company_slug_valid(), whose EXECUTE the slugs
// migration revoked from clients, so without this grant saving failed with 42501 for every company that
// has a slug (found by running the update as a real owner, features/company-profile.md).
describe("the database's slug check", () => {
  it("can be run by the owner who saves the profile", () => {
    const folder = join(process.cwd(), "supabase/migrations");
    const grants = readdirSync(folder)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => readFileSync(join(folder, file), "utf8"))
      .filter((sql) => /grant\s+execute\s+on\s+function\s+public\.company_slug_valid\(text\)\s+to\s+authenticated/i.test(sql));
    expect(grants).toHaveLength(1);
  });
});
