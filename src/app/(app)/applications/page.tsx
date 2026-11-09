import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ApplicationsTable, ApplicationsTableFallback } from "@/components/applications/applications-table";
import { CallbackApplications } from "@/components/applications/callback-applications";
import { getApplications } from "@/lib/applications/queries";
import { requireAccountType } from "@/lib/auth/dal";
import { getMyCallbackApplications } from "@/lib/cvs/queries";

export const metadata: Metadata = { title: "Applications | Callback" };

// The shell (sidebar, account block) lives in ../layout.tsx. Two lists: the candidate's applications
// to jobs posted on Callback (features/candidate-cvs.md), shown only when there are any, above their
// own tracker of applications elsewhere (features/applied.md), which fills the rest of the height.
// Both read cookies, so each loads inside Suspense.
export default function ApplicationsPage() {
  return (
    <div className="flex flex-col gap-4 md:min-h-0 md:flex-1">
      <Suspense fallback={null}>
        <AuthedCallbackApplications />
      </Suspense>
      <div className="md:min-h-0 md:flex-1">
        <Suspense fallback={<ApplicationsTableFallback />}>
          <AuthedApplicationsTable />
        </Suspense>
      </div>
    </div>
  );
}

async function AuthedCallbackApplications() {
  await connection();
  await requireAccountType("candidate");
  const items = await getMyCallbackApplications();
  return items.length > 0 ? <CallbackApplications items={items} /> : null;
}

async function AuthedApplicationsTable() {
  await connection();
  const user = await requireAccountType("candidate");
  const items = await getApplications(user.id);

  return <ApplicationsTable items={items} />;
}
