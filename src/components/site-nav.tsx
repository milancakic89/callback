"use client";

import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand";
import { cn } from "cn";

// The signed-out top bar, shared by the landing page (/) and the public job list (/jobs), so the
// step from one to the other doesn't change the product's look (features/visual-continuity.md).
// It is dark through the `dark` class alone: every colour is a token, so it doesn't depend on
// landing.css and renders the same over the landing's dark page and /jobs' light content (so the
// background is opaque: a translucent one would turn grey over white). Below `lg` the links fold
// into a menu: with Pricing and Jobs they no longer fit a tablet-wide bar.

const SECTION_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#candidates", label: "For candidates" },
  { href: "/#employers", label: "For employers" },
  { href: "/#pricing", label: "Pricing" },
];

const LINK =
  "rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const MENU_LINK = cn(LINK, "px-1 py-3 text-[15px]");
const BAR_LINK = cn(LINK, "px-3 py-1.5 text-[14px] whitespace-nowrap");

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const onJobs = usePathname() === "/jobs";

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const jobsLink = (className: string) => (
    <Link
      href="/jobs"
      aria-current={onJobs ? "page" : undefined}
      onClick={() => setOpen(false)}
      className={cn(className, onJobs && "text-foreground")}
    >
      Jobs
    </Link>
  );

  return (
    <header className="dark sticky top-0 z-50 border-b border-border bg-background text-foreground">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-10 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Callback home"
          className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Logo onDark className="h-[22px]" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {SECTION_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={BAR_LINK}>
              {link.label}
            </Link>
          ))}
          {jobsLink(BAR_LINK)}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/sign-in" className={cn(BAR_LINK, "hidden lg:inline-flex")}>
            Log in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[14px] font-medium whitespace-nowrap text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Get started
          </Link>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="-mr-2 inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
          >
            {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>

      <div id="site-menu" className={cn("border-t border-border bg-background lg:hidden", open ? "block" : "hidden")}>
        <div className="mx-auto flex w-full max-w-[1200px] flex-col px-4 py-3 sm:px-6">
          {SECTION_LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={MENU_LINK}>
              {link.label}
            </Link>
          ))}
          {jobsLink(MENU_LINK)}
          <Link href="/sign-in" onClick={() => setOpen(false)} className={MENU_LINK}>
            Log in
          </Link>
        </div>
      </div>
    </header>
  );
}
