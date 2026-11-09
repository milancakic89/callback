import { z } from "zod";
import { optionalText, text, tooLong } from "@/lib/validation/text-fields";
import { LOCATION_MAX } from "./job-posting";

// A company's profile (features/company-profile.md): what it does, and four facts. Plain module, no
// `server-only`: the profile form imports the limits and the preview helpers. The same limits are
// check constraints on `companies` (supabase/migrations/20261109160000_company_profiles.sql).
export const PROFILE_DESCRIPTION_MAX = 5_000;
export const WEBSITE_MAX = 200;
export const INDUSTRY_MAX = 80;
export const HEADQUARTERS_MAX = LOCATION_MAX;

// What the form says after saving (a "use server" file may only export functions, so it lives here).
export const PROFILE_SAVED_MESSAGE = "Profile saved. It is now on every job you have published.";

// The values of the database's `company_size` enum, smallest first.
export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  "1-10": "1-10 employees",
  "11-50": "11-50 employees",
  "51-200": "51-200 employees",
  "201-500": "201-500 employees",
  "501-1000": "501-1,000 employees",
  "1000+": "1,000+ employees",
};

export function isCompanySize(value: unknown): value is CompanySize {
  return COMPANY_SIZES.some((size) => size === value);
}

// What public.public_company_profile() answers.
export type CompanyProfileRow = {
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
  headquarters: string | null;
};

export type CompanyProfile = {
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  industry: string | null;
  size: CompanySize | null;
  headquarters: string | null;
};

// Field by field, so a column the function one day returns by mistake can't reach a page. A size the
// code doesn't know is dropped rather than shown.
export function toCompanyProfile(row: CompanyProfileRow): CompanyProfile {
  return {
    name: row.name,
    slug: row.slug,
    description: row.description,
    website: row.website,
    industry: row.industry,
    size: isCompanySize(row.size) ? row.size : null,
    headquarters: row.headquarters,
  };
}

// A website as the visitor will open it: `https://` is added when the employer leaves the scheme out
// ("acme.com"), and anything that isn't a plain http(s) address gives null. It goes into an `href`,
// so `javascript:` and its kind must never get through: the address is read as a URL with `https://`
// in front when it has no `http(s)://` of its own, which makes any other scheme either a broken host
// or one with no dot. A name and password in the address ("mailto:a@b.com" reads that way) are
// refused too. The result is the address as typed, not a normalised one, so it stays what the
// employer wrote.
export function normalizeWebsite(input: string): string | null {
  const typed = input.trim();
  if (!typed || /\s/.test(typed)) return null;

  const address = /^https?:\/\//i.test(typed) ? typed : `https://${typed}`;
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".")) return null;
  return address;
}

const WEBSITE_MESSAGE = "Enter a website like https://acme.com.";

const website = text.transform((value, context) => {
  if (!value) return null;
  const address = normalizeWebsite(value);
  if (address === null) {
    context.issues.push({ code: "custom", message: WEBSITE_MESSAGE, input: value });
    return z.NEVER;
  }
  if (address.length > WEBSITE_MAX) {
    context.issues.push({ code: "custom", message: tooLong(WEBSITE_MAX), input: value });
    return z.NEVER;
  }
  return address;
});

// What the profile form submits. Every field is optional: an empty one is stored as null.
export const companyProfileSchema = z.object({
  description: optionalText(PROFILE_DESCRIPTION_MAX),
  website,
  industry: optionalText(INDUSTRY_MAX),
  size: z
    .enum([...COMPANY_SIZES, ""], { error: "Choose a size from the list." })
    .transform((value) => (value === "" ? null : value)),
  headquarters: optionalText(HEADQUARTERS_MAX),
});

export type CompanyProfileInput = z.output<typeof companyProfileSchema>;

// "https://www.acme.com/careers" → "acme.com": what the website link says.
export function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type CompanyFact = { label: string; value: string; href?: string };

// The facts a visitor sees, in a fixed order, leaving out the ones the company didn't fill in.
export function companyFacts(profile: CompanyProfile): CompanyFact[] {
  const facts: CompanyFact[] = [];
  if (profile.industry) facts.push({ label: "Industry", value: profile.industry });
  if (profile.size) facts.push({ label: "Company size", value: COMPANY_SIZE_LABELS[profile.size] });
  if (profile.headquarters) facts.push({ label: "Headquarters", value: profile.headquarters });
  if (profile.website) {
    facts.push({ label: "Website", value: websiteLabel(profile.website), href: profile.website });
  }
  return facts;
}

// Whether there is anything to show about the company besides its name. A posting leaves the "About"
// card out when there isn't.
export function hasCompanyDetails(profile: CompanyProfile): boolean {
  return Boolean(profile.description) || companyFacts(profile).length > 0;
}

// The profile form's fields as typed, for the live preview next to the form. Mirrors what saving
// does to them (trim, empty to null, a website only when it is a usable one).
export type ProfileDraft = {
  description: string;
  website: string;
  industry: string;
  size: CompanySize | null;
  headquarters: string;
};

export function previewProfile(company: { name: string; slug: string }, draft: ProfileDraft): CompanyProfile {
  return {
    name: company.name,
    slug: company.slug,
    description: draft.description.trim() || null,
    website: normalizeWebsite(draft.website),
    industry: draft.industry.trim() || null,
    size: draft.size,
    headquarters: draft.headquarters.trim() || null,
  };
}

// The public page of a company, the employer's editor for it, and the cache tag of what the page reads.
export function companyProfilePath(slug: string): string {
  return `/companies/${slug}`;
}

export function companyProfileEditPath(slug: string): string {
  return `/${slug}/profile`;
}

export function companyCacheTag(slug: string): string {
  return `company:${slug}`;
}
