import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ApplicationsTable, ApplicationsTableFallback } from "@/components/applications/applications-table";
import { getApplications } from "@/lib/applications/queries";
import { requireAccountType } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Applications | Callback" };

// The shell (sidebar, account block) lives in ../layout.tsx. The user's applications read cookies,
// so they load inside Suspense, behind a static fallback.
export default function ApplicationsPage() {
  return (
    <Suspense fallback={<ApplicationsTableFallback />}>
      <AuthedApplicationsTable />
    </Suspense>
  );
}

async function AuthedApplicationsTable() {
  await connection();
  const user = await requireAccountType("candidate");
  const items = await getApplications(user.id);

  return <ApplicationsTable items={items} />;
}
