import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CompanyProfileEditor } from "@/components/employer/company-profile-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAccountType } from "@/lib/auth/dal";
import { getCompanyOrNotFound } from "@/lib/companies/get-company";
import { getCompanyProfile } from "@/lib/companies/profile-queries";

export const metadata: Metadata = { title: "Company profile | Callback" };

type Params = Promise<{ company: string }>;

// The company's profile (features/company-profile.md): what it does, shown on every job it publishes
// and on its public page. The heading is static; the slug and the account check are read inside
// Suspense (see get-company.ts and jobs/new/page.tsx).
export default function CompanyProfilePage({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Company profile</h1>
        <p className="text-sm text-muted-foreground">
          Tell candidates what your company does. It appears on every job you publish and on your public company
          page.
        </p>
      </div>
      <Suspense fallback={<EditorSkeleton />}>
        <AuthedProfileEditor params={params} />
      </Suspense>
    </div>
  );
}

async function AuthedProfileEditor({ params }: { params: Params }) {
  const company = await getCompanyOrNotFound(params);
  await connection();
  await requireAccountType("employer");
  const profile = await getCompanyProfile(company.slug);
  return <CompanyProfileEditor company={company} profile={profile} />;
}

// The same two columns as <CompanyProfileEditor>, so the form doesn't shift the page when it streams in.
function EditorSkeleton() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Skeleton className="h-[34rem] rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
