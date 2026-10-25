import { Suspense } from "react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { SidebarAccount } from "@/components/dashboard/sidebar-account";

// Fixed app shell (h-dvh, no page scroll) for the candidate side — /dashboard, /saved-jobs and
// /applications; src/app/(employer)/layout.tsx mirrors it for employers: a sidebar plus the page's content, both filling the viewport. From `md` up only a table's rows
// scroll — see the `fillHeight`/`scrollable` plumbing in jobs-explorer.tsx and jobs-table.tsx.
// Below `md` the sidebar is a top bar with a burger menu, the tables are tall cards, and <main>
// itself scrolls — which is why its children must not shrink to the viewport there (a table card
// is overflow-hidden, so it would, and clip its own rows). The account block reads cookies, so it
// must stay inside a Suspense boundary.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-muted/30 md:flex-row">
      <DashboardSidebar area="candidate">
        <Suspense fallback={<div className="h-20 shrink-0 border-t border-border" />}>
          <SidebarAccount />
        </Suspense>
      </DashboardSidebar>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 max-md:*:shrink-0 md:overflow-hidden">
        {children}
      </main>
    </div>
  );
}
