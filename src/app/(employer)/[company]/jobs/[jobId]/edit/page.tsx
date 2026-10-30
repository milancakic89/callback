import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { JobEditor } from "@/components/employer/job-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAccountType } from "@/lib/auth/dal";
import { getCompanyOrNotFound } from "@/lib/companies/get-company";
import { getCompanyJob } from "@/lib/companies/workspace";

export const metadata: Metadata = { title: "Edit job | Callback" };

type Params = Promise<{ company: string; jobId: string }>;

// The job form with the job's current values (features/job-publishing.md). A job can be edited
// whether or not it is published and whether or not people applied; the demo job can't. `jobId` is
// per-request data like the slug, so it is read inside Suspense, after the slug and the account check
// (the pattern of jobs/new/page.tsx). A job that isn't the company's, or doesn't exist, or isn't a
// uuid, is the ordinary not-found page.
export default function EditJobPage({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit job</h1>
      <Suspense fallback={<EditorSkeleton />}>
        <AuthedJobEditor params={params} />
      </Suspense>
    </div>
  );
}

async function AuthedJobEditor({ params }: { params: Params }) {
  const company = await getCompanyOrNotFound(params);
  await connection();
  await requireAccountType("employer");

  const job = await getCompanyJob((await params).jobId);
  if (!job || job.isDemo) notFound();

  return <JobEditor companyName={company.name} companySlug={company.slug} job={job} />;
}

// The same two columns as <JobEditor>, so the form doesn't shift the page when it streams in.
function EditorSkeleton() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Skeleton className="h-[44rem] rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
