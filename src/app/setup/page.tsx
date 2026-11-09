import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ContinueForm, SetupForm } from "@/components/company/setup-form";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAccountType } from "@/lib/auth/dal";
import { companyHome } from "@/lib/companies/company";
import { getOwnCompany } from "@/lib/companies/get-company";

export const metadata: Metadata = { title: "Set up your company | Callback" };

// Where an employer without a company address lands (features/company-slugs.md): after activating
// the account, and again on the next visit for the three companies that existed before addresses.
// The card is per-request data (the session, the company), so it is read inside Suspense and the
// page shell stays static.
export default function SetupPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-3xl rounded-xl" />}>
      <AuthedSetup />
    </Suspense>
  );
}

async function AuthedSetup() {
  await connection();
  const user = await requireAccountType("employer");
  // Nothing to set up: proxy sends such an employer home too; this covers a stale optimistic check.
  if (user.companySlug) redirect(companyHome(user.companySlug));

  // A company with an address that this session doesn't know yet (a refresh that failed, or the
  // setup done on another device).
  const company = await getOwnCompany();
  if (company) {
    return (
      <AuthCard title="Your company is set up" description={`${company.name} is at /${company.slug}.`}>
        <ContinueForm name={company.name} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set up your company"
      description="Name your company and pick the address of its workspace. Candidates will know you by this name."
    >
      <SetupForm />
    </AuthCard>
  );
}
