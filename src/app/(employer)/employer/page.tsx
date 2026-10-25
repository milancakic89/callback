import { BriefcaseBusinessIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAccountType } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Dashboard | Callback" };

// The employer home. Empty for now: posting jobs and reviewing candidates are still to come
// (features/account-types.md). The heading is static; the account check reads cookies, so it sits
// in Suspense like the candidate pages.
export default function EmployerDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Employer dashboard</h1>
      <Suspense fallback={<EmptyState />}>
        <AuthedEmployerDashboard />
      </Suspense>
    </div>
  );
}

async function AuthedEmployerDashboard() {
  await connection();
  await requireAccountType("employer");
  return <EmptyState />;
}

function EmptyState() {
  return (
    <div className="flex max-w-2xl flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-card p-6 sm:p-8">
      <span className="inline-flex size-10 items-center justify-center rounded-lg bg-muted">
        <BriefcaseBusinessIcon aria-hidden className="size-5 text-muted-foreground" />
      </span>
      <p className="font-medium">Your hiring workspace is on its way</p>
      <p className="text-sm text-muted-foreground">
        Posting jobs and reviewing candidates is coming soon. You&rsquo;ll find them here.
      </p>
    </div>
  );
}
