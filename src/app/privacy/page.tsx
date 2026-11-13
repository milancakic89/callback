import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";
import { PrivacyPolicy } from "@/components/legal/privacy-policy";
import { LEGAL_LAST_UPDATED, LEGAL_OPERATOR } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Privacy Policy | Callback",
  description: "What personal data Callback handles, why, who sees it, and what you can ask of us.",
};

// The Privacy Policy (features/legal-pages.md), open to every visitor: proxy lets /privacy through for a
// signed-out one because it is one of APP_ROUTES. Static: no data, and the date is a constant.
export default function PrivacyPage() {
  return (
    <LegalPageShell>
      <PrivacyPolicy operator={LEGAL_OPERATOR} lastUpdated={LEGAL_LAST_UPDATED} />
    </LegalPageShell>
  );
}
