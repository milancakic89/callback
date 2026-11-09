// A company's workspace lives under its slug (features/companies.md, features/company-slugs.md):
// /{slug} is the employer dashboard, /{slug}/jobs/new the job form. The slug is chosen once, on
// /setup, and rides in the JWT as app_metadata.company_slug. No `server-only`: proxy, the sidebar and
// the setup form use it too.
import { normalizeText } from "@/lib/jobs/filter";

export type Company = { slug: string; name: string };

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;
export const COMPANY_NAME_MAX_LENGTH = 100;

// The top-level URL segments the app serves itself. Any other first segment is a company's slug
// (a "workspace path"), so a new folder in src/app needs a line here: company.test.ts reads the
// folders and fails until it has one.
export const APP_ROUTES = [
  "api",
  "applications",
  "auth",
  "companies",
  "dashboard",
  "dev",
  "forgot-password",
  "jobs",
  "profile",
  "reset-password",
  "saved-jobs",
  "settings",
  "setup",
  "sign-in",
  "sign-up",
] as const;

// What no company may be called: the app's own routes, and words kept for pages it may get. The
// database has the same list (company_slug_valid in supabase/migrations/20261109120000_company_slugs.sql)
// and company.test.ts fails when the two differ, so a change here needs a new migration that replaces
// that function.
export const RESERVED_SLUGS: readonly string[] = [
  ...APP_ROUTES,
  "about",
  "account",
  "admin",
  "app",
  "apply",
  "assets",
  "blog",
  "callback",
  "candidate",
  "candidates",
  "careers",
  "company",
  "contact",
  "docs",
  "edit",
  "employer",
  "employers",
  "favicon",
  "help",
  "home",
  "login",
  "logout",
  "new",
  "pricing",
  "privacy",
  "public",
  "review",
  "robots",
  "saved",
  "search",
  "sign-out",
  "signin",
  "signup",
  "sitemap",
  "static",
  "status",
  "support",
  "terms",
  "test",
  "www",
];

// a-z, 0-9 and "-", 3 to 40 characters, no hyphen at either end (company_slug_valid in the database).
const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export type SlugProblem = "format" | "reserved";

// Why a slug can't be used, or null when it can. "format" is a shape the user can fix by typing;
// "reserved" is a word that is taken for the app.
export function slugProblem(slug: string): SlugProblem | null {
  if (!SLUG_FORMAT.test(slug)) return "format";
  if (RESERVED_SLUGS.includes(slug)) return "reserved";
  return null;
}

export function isValidSlug(slug: string): boolean {
  return slugProblem(slug) === null;
}

// What the JWT's company_slug claim means: a valid slug, or null for a missing, malformed or
// tampered value. It is read from app_metadata, which only the secret key can change, so this is a
// safety net rather than a defence.
export function parseCompanySlug(value: unknown): string | null {
  return typeof value === "string" && isValidSlug(value) ? value : null;
}

// Legal forms say nothing about the company: "Petrović d.o.o." is just "Petrović". Matched as whole
// words once the name is normalised, so "Doodle" and "Llcorp" are left alone.
const LEGAL_FORM = /\b(?:d o o|doo|llc|gmbh)\b/g;

// The address suggested from a company's name ("Petrović d.o.o." → "petrovic"): no diacritics, no
// legal form, words joined by hyphens, cut at the longest length. It only suggests: the result may
// be empty (a name with no Latin letters), too short or reserved, and the setup form says so.
export function slugify(name: string): string {
  const words = normalizeText(name.replace(/[-_]/g, " "))
    // Apostrophes and dots vanish ("Joe's" → "joes", "d.o.o." → "doo"); any other mark splits words.
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  // A name that is nothing but a legal form keeps it, so the suggestion isn't empty.
  const base = words.replace(LEGAL_FORM, " ").replace(/\s+/g, " ").trim() || words;
  return base.slice(0, SLUG_MAX_LENGTH).trim().replace(/ /g, "-");
}

// The company's home, and the base of every employer link.
export function companyHome(slug: string): string {
  return `/${slug}`;
}

function firstSegment(pathname: string): string {
  return pathname.split("/")[1] ?? "";
}

// A path under a company's slug: the first segment is shaped like a slug and isn't a route of the
// app. A path with a dot ("/robots.txt", "/media/clip.mp4") is a file from public/, and no
// employer page has one.
export function isWorkspacePath(pathname: string): boolean {
  if (pathname.includes(".")) return false;
  const segment = firstSegment(pathname);
  if (!/^[a-z0-9-]+$/.test(segment)) return false;
  return !(APP_ROUTES as readonly string[]).includes(segment);
}

// The addresses employers had before slugs: /employer first, then the fixture company's /test.
// Both are reserved, so neither can ever be a company; a signed-in employer who follows an old link
// (an activation email, a bookmark) is sent home.
export function isLegacyWorkspacePath(pathname: string): boolean {
  const segment = firstSegment(pathname);
  return segment === "employer" || segment === "test";
}
