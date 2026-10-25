"use client";

import { ClipboardCheckIcon, HeartIcon, HomeIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: HomeIcon },
  { href: "/saved-jobs", label: "Saved jobs", icon: HeartIcon },
  { href: "/applications", label: "Applications", icon: ClipboardCheckIcon },
];

// `onNavigate` lets the burger menu fold itself away when a link is tapped (including the link to
// the page you are already on, which changes no pathname to react to).
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
              active
                ? "bg-primary/25 text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
