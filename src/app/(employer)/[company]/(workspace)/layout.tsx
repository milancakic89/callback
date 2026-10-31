import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { SidebarAccount } from "@/components/dashboard/sidebar-account";
import { getCompanyOrNotFound } from "@/lib/companies/get-company";

const SHELL_CLASS = "flex h-dvh w-full flex-col overflow-hidden bg-muted/30 md:flex-row";
const MAIN_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 max-md:*:shrink-0";

// The employer side of the app (features/account-types.md, features/companies.md): the same fixed
// shell as the candidate side (src/app/(app)/layout.tsx), with the employer's own sidebar items.
// Every employer page but the applicant review, which takes the whole screen ((review)/layout.tsx).
//
// The slug is per-URL data, so it is read inside <Suspense> (Next's "URL data outside of Suspense"
// insight) — and the Suspense wraps the whole shell, not just the page. That way an unknown slug
// (`/foo`) throws notFound() before any employer chrome is rendered: it gets the ordinary not-found
// page, and a signed-out visitor isn't sent to sign-in by the account block. The fallback is a plain
// frame the same size as the shell. Each page still checks requireAccountType("employer"); proxy
// only redirects optimistically.
export default function EmployerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ company: string }>;
}) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <CompanyShell params={params}>{children}</CompanyShell>
    </Suspense>
  );
}

async function CompanyShell({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ company: string }>;
}) {
  await getCompanyOrNotFound(params);

  return (
    <div className={SHELL_CLASS}>
      <DashboardSidebar area="employer">
        <Suspense fallback={<div className="h-20 shrink-0 border-t border-border" />}>
          <SidebarAccount />
        </Suspense>
      </DashboardSidebar>

      <main className={MAIN_CLASS}>{children}</main>
    </div>
  );
}

// Not <DashboardSidebar>: its nav reads the pathname, which is the very thing that isn't known here.
function ShellFallback() {
  return (
    <div className={SHELL_CLASS}>
      <aside className="shrink-0 border-b border-border bg-card md:h-full md:w-56 md:border-r md:border-b-0">
        <div className="flex h-14 items-center px-4">
          <Logo />
        </div>
      </aside>
      <main className={MAIN_CLASS} />
    </div>
  );
}
