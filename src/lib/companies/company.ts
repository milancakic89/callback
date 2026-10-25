// A company's workspace lives under its slug (features/companies.md): /{slug} is the employer
// dashboard, /{slug}/jobs/new the job form. No `server-only`: proxy and the sidebar use it too.
//
// There is no `companies` table yet, so the one company is a fixture and every employer account
// belongs to it. Any other slug is a 404.

export type Company = { slug: string; name: string };

export const TEST_COMPANY: Company = { slug: "test", name: "Test company" };

export function getCompanyBySlug(slug: string): Company | null {
  return slug === TEST_COMPANY.slug ? TEST_COMPANY : null;
}

export function companyHome(company: Company): string {
  return `/${company.slug}`;
}
