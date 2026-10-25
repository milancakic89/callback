"use client";

import { MenuIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { SidebarNav } from "./sidebar-nav";

// Left nav for the signed-in app (public/dashboard-example.avif is the style reference). Below `md`
// it is a top bar instead, whose burger button drops the same menu (nav + account block) down over
// the page and folds it away again; from `md` up the menu is always open as a sidebar. `children`
// is the account/sign-out block, rendered by the layout so its own Suspense boundary (it reads
// cookies) stays with the caller.
export function DashboardSidebar({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Tap-outside-to-close, and a dim over the page while the menu is down. */}
      {open && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside className="relative z-30 shrink-0 border-b border-border bg-card md:flex md:h-full md:w-56 md:flex-col md:border-r md:border-b-0">
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <Wordmark className="text-base" />
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="-mr-2 md:hidden"
            onClick={() => setOpen((prev) => !prev)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="sidebar-menu"
          >
            {open ? <XIcon /> : <MenuIcon />}
          </Button>
        </div>
        <div
          id="sidebar-menu"
          className={cn(
            "absolute inset-x-0 top-full flex-col border-b border-border bg-card shadow-lg md:static md:flex md:min-h-0 md:flex-1 md:border-b-0 md:shadow-none",
            open ? "flex" : "hidden",
          )}
        >
          <SidebarNav onNavigate={() => setOpen(false)} />
          {children}
        </div>
      </aside>
    </>
  );
}
