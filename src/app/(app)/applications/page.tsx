import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ApplicationsTable, ApplicationsTableFallback } from "@/components/applications/applications-table";
import { mergeApplications, withCvFileNames } from "@/lib/applications/list";
import { getApplications, getExternalApplications } from "@/lib/applications/queries";
import { requireAccountType } from "@/lib/auth/dal";
import { getMyCallbackApplications, getMyCvs } from "@/lib/cvs/queries";

export const metadata: Metadata = { title: "Applications | Callback" };

// The shell (sidebar, account block) lives in ../layout.tsx. One table of every job the candidate has
// applied to: the jobs they track by hand (features/applied.md) and the applications to jobs posted on
// Callback, which are picked out and have an automatic status (features/callback-applications-in-table.md),
// and the jobs added from LinkedIn, HelloWorld or Infostud with the browser extension, named with the CV
// each used (features/chrome-extension.md). All of them read cookies, so they load together inside Suspense.
export default function ApplicationsPage() {
  return (
    <div className="md:min-h-0 md:flex-1">
      <Suspense fallback={<ApplicationsTableFallback />}>
        <AuthedApplicationsTable />
      </Suspense>
    </div>
  );
}

async function AuthedApplicationsTable() {
  await connection();
  const user = await requireAccountType("candidate");
  const [manual, callback, external, cvs] = await Promise.all([
    getApplications(user.id),
    getMyCallbackApplications(),
    getExternalApplications(user.id),
    getMyCvs(),
  ]);

  return <ApplicationsTable items={mergeApplications(manual, callback, withCvFileNames(external, cvs))} />;
}
