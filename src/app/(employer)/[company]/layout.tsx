// The company's pages come in two frames: (workspace) with the sidebar, and (review), the applicant
// review on the whole screen (features/applicant-review.md). Each checks the slug itself, inside
// <Suspense>.
//
// There is no generateStaticParams: slugs come from accounts, so the segment is runtime data (Next's
// dynamic-routes docs, "Without generateStaticParams"), and everything that reads it is already
// inside a Suspense boundary.
export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
