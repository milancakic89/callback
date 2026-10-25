import "server-only";
import { notFound } from "next/navigation";
import { getCompanyBySlug, type Company } from "./company";

// Resolves the `[company]` segment of an employer page, or a 404 for a slug that isn't a company.
// It awaits `params`, which is per-URL data, so call it from a component inside <Suspense> and pass
// the `params` promise down without awaiting it in the page: reading it at the top of a page or
// layout ties the shared App Shell to one URL (Next's "URL data outside of Suspense" insight).
export async function getCompanyOrNotFound(params: Promise<{ company: string }>): Promise<Company> {
  const company = getCompanyBySlug((await params).company);
  if (!company) notFound();
  return company;
}
