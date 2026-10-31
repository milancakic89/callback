import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { JobEditor } from "@/components/employer/job-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAccountType } from "@/lib/auth/dal";
import { getCompanyOrNotFound } from "@/lib/companies/get-company";

export const metadata: Metadata = { title: "Create job | Callback" };

type Params = Promise<{ company: string }>;

// The job form with a live preview of the posting as a candidate will see it
// (features/companies.md, features/post-job.md). Publishing runs the createJobPosting Server Action
// and lands back on the dashboard. The heading is static; the slug and the account check are read
// inside Suspense (see get-company.ts).
export default function NewJobPage({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Create job</h1>
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
  return <JobEditor companyName={company.name} companySlug={company.slug} />;
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
