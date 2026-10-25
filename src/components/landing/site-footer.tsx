import Link from "next/link";
import { Logo } from "@/components/brand";
import { Container } from "./ui";

const GROUPS = [
  {
    title: "Product",
    links: [
      { href: "#product", label: "Fast Manual Mode" },
      { href: "#screening", label: "Screening" },
      { href: "#updates", label: "Candidate updates" },
      { href: "#pricing", label: "Pricing" },
    ],
  },
  {
    title: "Candidates",
    links: [
      { href: "/jobs", label: "Browse jobs" },
      { href: "/sign-up", label: "Create an account" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/sign-in", label: "Log in" },
      { href: "/sign-up", label: "Get started" },
    ],
  },
];

// No copyright year: reading the clock here would bake the build date into the static shell.
export function SiteFooter() {
  return (
    <footer className="border-t border-(--l-line)">
      <Container className="flex flex-col gap-12 py-14 md:flex-row md:justify-between">
        <div className="flex flex-col gap-4">
          <Link href="/" aria-label="Callback home" className="w-fit rounded-md">
            <Logo onDark className="h-[22px]" />
          </Link>
          <p className="max-w-xs text-[14px] text-(--l-fg-subtle)">Every application deserves a response.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3 sm:gap-16">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[13px] font-medium">{group.title}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("#") ? (
                      <a href={link.href} className="text-[14px] text-(--l-fg-subtle) transition-colors hover:text-(--l-fg)">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-[14px] text-(--l-fg-subtle) transition-colors hover:text-(--l-fg)">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Container>
      <Container>
        <p className="border-t border-(--l-line) py-6 text-[12.5px] text-(--l-fg-subtle)">
          Job listings belong to their publishers. Candidates and documents shown on this page are fictional.
        </p>
      </Container>
    </footer>
  );
}
