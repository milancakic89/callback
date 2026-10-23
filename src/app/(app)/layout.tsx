import { connection } from "next/server";
import { Suspense } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { requireUser } from "@/lib/auth/dal";

// Fixed app shell (h-dvh, no page scroll) shared by /dashboard and /applications: a sidebar plus
// the page's content, both filling the viewport. Only a table's rows scroll — see the
// `fillHeight`/`scrollable` plumbing in jobs-explorer.tsx and jobs-table.tsx. The account block
// reads cookies, so it must stay inside a Suspense boundary.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-muted/30">
      <DashboardSidebar>
        <Suspense fallback={<div className="h-20 shrink-0 border-t border-border" />}>
          <SidebarAccount />
        </Suspense>
      </DashboardSidebar>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-6 py-6">{children}</main>
    </div>
  );
}

async function SidebarAccount() {
  // Opt out of prerendering: the Supabase client reads Date.now() while verifying the JWT.
  await connection();
  const user = await requireUser();

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3">
      <span className="truncate text-xs text-muted-foreground" title={user.email}>
        {user.email}
      </span>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
