import { HomeIcon } from "lucide-react";
import Link from "next/link";

// Left nav for /dashboard (public/dashboard-example.avif is the style reference). Just Home for
// now, which is the dashboard itself — see features/dashboard.md and the roadmap for what a real
// multi-item nav (Applications, Phase 4) adds later. `children` is the account/sign-out block,
// rendered by the page so its own Suspense boundary (it reads cookies) stays with the caller.
export function DashboardSidebar({ children }: { children?: React.ReactNode }) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 shrink-0 items-center px-4">
        <span className="font-heading text-base font-semibold tracking-tight">Job Manager</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
        >
          <HomeIcon className="size-4" />
          Home
        </Link>
      </nav>
      {children}
    </aside>
  );
}
