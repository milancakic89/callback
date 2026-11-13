import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CandidateStepsEditor } from "@/components/employer/candidate-steps-editor";
import { GoogleCalendarCard } from "@/components/employer/google-calendar-card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAccountType } from "@/lib/auth/dal";
import { getCandidateSteps } from "@/lib/companies/candidate-steps-queries";
import { getCompanyOrNotFound } from "@/lib/companies/get-company";
import { getGoogleStatus, ownCompanyId } from "@/lib/google/connection";
import type { GoogleStatus } from "@/lib/interviews/types";

export const metadata: Metadata = { title: "Settings | Callback" };

type Params = Promise<{ company: string }>;
type SearchParams = Promise<{ google?: string | string[] }>;

// The company's settings (features/candidate-steps.md): for now its candidate steps, the statuses a
// candidate moves through between Applied and Offer, which every job of the company uses. The heading
// is static; the slug and the account check are read inside Suspense (see get-company.ts and
// jobs/new/page.tsx).
export default function SettingsPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Candidate steps: the statuses your hiring process goes through. Candidates see where they stand, with the
          text you write for each step.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-[28rem] max-w-3xl rounded-xl" />}>
        <AuthedStepsEditor params={params} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-40 max-w-3xl rounded-xl" />}>
        <AuthedGoogleCard params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AuthedStepsEditor({ params }: { params: Params }) {
  const company = await getCompanyOrNotFound(params);
  await connection();
  await requireAccountType("employer");
  const steps = await getCandidateSteps();
  return <CandidateStepsEditor steps={steps} companySlug={company.slug} />;
}

// Reads `?google=` (how the trip to Google went), which is per-request data like the slug.
async function AuthedGoogleCard({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await getCompanyOrNotFound(params);
  await connection();
  await requireAccountType("employer");
  const { google } = await searchParams;

  const unavailable: GoogleStatus = { configured: false, connected: false, email: null, broken: false };
  let status = unavailable;
  try {
    const companyId = await ownCompanyId();
    if (companyId) status = await getGoogleStatus(companyId);
  } catch (error) {
    console.error("The Google Calendar card could not read the connection:", error);
  }
  return <GoogleCalendarCard status={status} flag={typeof google === "string" ? google : undefined} />;
}
