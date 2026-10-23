import { SidebarNav } from "./sidebar-nav";

// Left nav for the signed-in app (public/dashboard-example.avif is the style reference). The nav
// items are a Client Component because the active one follows the pathname. `children` is the
// account/sign-out block, rendered by the layout so its own Suspense boundary (it reads cookies)
// stays with the caller.
export function DashboardSidebar({ children }: { children?: React.ReactNode }) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 shrink-0 items-center px-4">
        <span className="font-heading text-base font-semibold tracking-tight">Job Manager</span>
      </div>
      <SidebarNav />
      {children}
    </aside>
  );
}
