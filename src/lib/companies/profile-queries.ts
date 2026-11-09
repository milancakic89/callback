import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { supabasePublic } from "@/lib/supabase/public";
import { isValidSlug } from "./company";
import { companyCacheTag, toCompanyProfile, type CompanyProfile, type CompanyProfileRow } from "./profile";

// The profile of a company as a visitor sees it (features/company-profile.md): the name, and what the
// company wrote about itself. Cached, and expired by name when the company saves its profile
// (saveCompanyProfile), so a posting follows an edit on the very next visit. `supabasePublic` has no
// cookies, so it can sit inside `'use cache'`; the function it calls answers only these columns
// (supabase/migrations/20261109160000_company_profiles.sql).
async function readCompanyProfile(slug: string): Promise<CompanyProfile | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(companyCacheTag(slug));

  const { data, error } = await supabasePublic.rpc("public_company_profile", { p_slug: slug });
  // Throws, so the cache never keeps a company as "not found" because the database was down.
  if (error) throw new Error(`public_company_profile: ${error.message}`);
  const row = ((data ?? []) as CompanyProfileRow[])[0];
  return row ? toCompanyProfile(row) : null;
}

// Null for a company that doesn't exist or hasn't been set up. A slug that can't be one is answered
// here, before the cache: the address is whatever a visitor typed, and it would otherwise become a
// cache key and a tag of any length.
export async function getCompanyProfile(slug: string): Promise<CompanyProfile | null> {
  if (!isValidSlug(slug)) return null;
  return readCompanyProfile(slug);
}
