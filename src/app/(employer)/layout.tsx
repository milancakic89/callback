import { Suspense } from "react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { SidebarAccount } from "@/components/dashboard/sidebar-account";

// The employer side of the app (features/account-types.md): the same fixed shell as the candidate
// side (src/app/(app)/layout.tsx), with the employer's own sidebar items. Each page checks
// requireAccountType("employer"); proxy only redirects optimistically.
export default function EmployerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-muted/30 md:flex-row">
      <DashboardSidebar area="employer">
        <Suspense fallback={<div className="h-20 shrink-0 border-t border-border" />}>
          <SidebarAccount />
        </Suspense>
      </DashboardSidebar>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 max-md:*:shrink-0">
        {children}
      </main>
    </div>
  );
}
