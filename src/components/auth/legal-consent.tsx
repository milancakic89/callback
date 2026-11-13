import Link from "next/link";
import { LEGAL_LINKS } from "@/lib/legal/constants";

// The sentence under Create account (features/legal-pages.md). The links open in a new tab, so the
// half-filled form isn't lost by reading them.
export function LegalConsent() {
  const linkStyle = "underline underline-offset-4 hover:text-foreground";
  return (
    <p className="text-center text-xs text-muted-foreground">
      By creating an account you agree to the{" "}
      <Link href={LEGAL_LINKS.terms.href} target="_blank" rel="noopener" className={linkStyle}>
        {LEGAL_LINKS.terms.label}
      </Link>{" "}
      and the{" "}
      <Link href={LEGAL_LINKS.privacy.href} target="_blank" rel="noopener" className={linkStyle}>
        {LEGAL_LINKS.privacy.label}
      </Link>
      .
    </p>
  );
}
