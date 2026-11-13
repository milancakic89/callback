import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";
import { TermsOfService } from "@/components/legal/terms-of-service";
import { LEGAL_LAST_UPDATED, LEGAL_OPERATOR } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Terms of Service | Callback",
  description: "The rules for using Callback, for candidates and for employers.",
};

// The Terms of Service (features/legal-pages.md), open to every visitor, like /privacy.
export default function TermsPage() {
  return (
    <LegalPageShell>
      <TermsOfService operator={LEGAL_OPERATOR} lastUpdated={LEGAL_LAST_UPDATED} />
    </LegalPageShell>
  );
}
