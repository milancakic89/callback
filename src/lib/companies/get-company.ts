import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isValidSlug, type Company } from "./company";
import { createClient } from "@/lib/supabase/server";

type CompanyRow = { slug: string; name: string | null };

// Read with the signed-in user's own client: row level security only shows an owner their own
// company (supabase/migrations/20261026210000_employer_jobs.sql), so another company's slug, an
// unknown one and a signed-out visitor all find nothing. Cached per request by slug, since the
// layout and the page both ask.
const findCompany = cache(async (slug: string): Promise<Company | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("slug, name")
    .eq("slug", slug)
    .maybeSingle<CompanyRow>();
  if (error) throw new Error(`findCompany: ${error.message}`);
  return data ? { slug: data.slug, name: data.name ?? data.slug } : null;
});

// Resolves the `[company]` segment of an employer page, or a 404 for a slug that isn't the signed-in
// employer's company. It awaits `params` and reads the session, so call it from a component inside
// <Suspense> and pass the `params` promise down without awaiting it in the page: reading it at the
// top of a page or layout ties the shared App Shell to one URL (Next's "URL data outside of Suspense"
// insight).
export async function getCompanyOrNotFound(params: Promise<{ company: string }>): Promise<Company> {
  const slug = (await params).company;
  // A malformed or reserved segment can't be a company: no need to ask the database.
  if (!isValidSlug(slug)) notFound();
  // Render at request time: the Supabase client reads Date.now() while it checks the session, which a
  // prerender (the App Shell has the cookies but not the clock) refuses, as in SidebarAccount.
  await connection();
  const company = await findCompany(slug);
  if (!company) notFound();
  return company;
}

// The signed-in employer's own company, whatever its slug (none yet gives null). It is how /setup
// tells an employer whose company is already set up but whose session doesn't know it yet.
export const getOwnCompany = cache(async (): Promise<Company | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").select("slug, name").maybeSingle<CompanyRow>();
  if (error) throw new Error(`getOwnCompany: ${error.message}`);
  return data?.slug ? { slug: data.slug, name: data.name ?? data.slug } : null;
});
