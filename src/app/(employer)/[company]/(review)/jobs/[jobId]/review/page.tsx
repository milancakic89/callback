import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ApplicantReview } from "@/components/review/applicant-review";
import { ReviewEmpty, ReviewSkeleton } from "@/components/review/review-frame";
import { requireAccountType } from "@/lib/auth/dal";
import type { GoogleStatus } from "@/lib/interviews/types";
import { getCandidateSteps } from "@/lib/companies/candidate-steps-queries";
import { getCompanyOrNotFound } from "@/lib/companies/get-company";
import { getCompanyJob, getJobApplicants } from "@/lib/companies/workspace";
import { getGoogleStatus, ownCompanyId } from "@/lib/google/connection";

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
  const [applicants, steps, google] = await Promise.all([
    getJobApplicants(job.id),
    getCandidateSteps(),
    googleStatusOfOwnCompany(),
  ]);

  const reviewJob = {
    id: job.id,
    title: job.title,
    isDemo: job.isDemo,
    requiredFilters: job.requiredFilters,
    optionalFilters: job.optionalFilters,
  };
  if (applicants.length === 0) return <ReviewEmpty companySlug={company.slug} job={reviewJob} />;

  return (
    <ApplicantReview companySlug={company.slug} job={reviewJob} applicants={applicants} steps={steps} google={google} />
  );
}

// Whether the company's Google Calendar is connected, for the interview invitations
// (features/interview-invitations.md). Never throws: the review works without it.
async function googleStatusOfOwnCompany(): Promise<GoogleStatus> {
  const unavailable: GoogleStatus = { configured: false, connected: false, email: null, broken: false };
  try {
    const companyId = await ownCompanyId();
    return companyId ? await getGoogleStatus(companyId) : unavailable;
  } catch (error) {
    console.error("googleStatusOfOwnCompany failed:", error);
    return unavailable;
  }
}
