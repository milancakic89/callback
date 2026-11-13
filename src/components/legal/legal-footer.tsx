import Link from "next/link";
import { LEGAL_LINKS } from "@/lib/legal/constants";

const FOOTER_LINK =
  "rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// The foot of the two legal pages (features/legal-pages.md): each links to the other, and to the front page.
export function LegalFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <nav
        aria-label="Legal"
        className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground sm:px-6 lg:px-8"
      >
        {Object.values(LEGAL_LINKS).map((link) => (
          <Link key={link.href} href={link.href} className={FOOTER_LINK}>
            {link.label}
          </Link>
        ))}
        <Link href="/" className={FOOTER_LINK}>
          Home
        </Link>
      </nav>
    </footer>
  );
}
