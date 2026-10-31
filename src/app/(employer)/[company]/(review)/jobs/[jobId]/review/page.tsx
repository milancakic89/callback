import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ApplicantReview } from "@/components/review/applicant-review";
import { ReviewEmpty, ReviewSkeleton } from "@/components/review/review-frame";
import { requireAccountType } from "@/lib/auth/dal";
import { getCompanyOrNotFound } from "@/lib/companies/get-company";
import { getCompanyJob, getJobApplicants } from "@/lib/companies/workspace";

export const metadata: Metadata = { title: "Review applicants | Callback" };

type Params = Promise<{ company: string; jobId: string }>;

// Reviewing a job's applicants (features/applicant-review.md), opened by Lets start on the job's
// card. Everything here is per-request data (the slug, the account, the job and its applicants), so
// it is read inside Suspense, in the order of the edit page. A job that isn't the company's, or
// doesn't exist, is the ordinary not-found page.
export default function ReviewApplicantsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <AuthedReview params={params} />
    </Suspense>
  );
}

async function AuthedReview({ params }: { params: Params }) {
  const company = await getCompanyOrNotFound(params);
  await connection();
  await requireAccountType("employer");

  const job = await getCompanyJob((await params).jobId);
  if (!job) notFound();
  const applicants = await getJobApplicants(job.id);

  const reviewJob = {
    id: job.id,
    title: job.title,
    isDemo: job.isDemo,
    requiredFilters: job.requiredFilters,
    optionalFilters: job.optionalFilters,
  };
  if (applicants.length === 0) return <ReviewEmpty companySlug={company.slug} job={reviewJob} />;

  return <ApplicantReview companySlug={company.slug} job={reviewJob} applicants={applicants} />;
}
