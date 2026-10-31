import { TEST_COMPANY } from "@/lib/companies/company";

// Only the fixture company exists, so it is the one prerendered slug (and what lets the build check
// this route under Cache Components). Any other slug renders on demand.
export function generateStaticParams() {
  return [{ company: TEST_COMPANY.slug }];
}

// The company's pages come in two frames: (workspace) with the sidebar, and (review), the applicant
// review on the whole screen (features/applicant-review.md). Each checks the slug itself.
export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
