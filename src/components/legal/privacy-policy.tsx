import { LegalDocument } from "@/components/legal/legal-document";
import { googleData } from "@/components/legal/privacy-google-section";
import { howWeUseIt, whatWeCollect, whoSeesIt, whoWeAre } from "@/components/legal/privacy-data-sections";
import {
  ageLimit,
  changesToPolicy,
  cookies,
  howLongWeKeepIt,
  security,
  whereDataIsProcessed,
  yourRights,
} from "@/components/legal/privacy-rights-sections";
import type { LegalOperator } from "@/lib/legal/constants";

// The Privacy Policy (features/legal-pages.md), put together from its parts. The order matters: the parts
// refer to each other by number (4 who sees your data, 5 Google, 8 your rights, 9 cookies).
export function PrivacyPolicy({ operator, lastUpdated }: { operator: LegalOperator; lastUpdated: string }) {
  return (
    <LegalDocument
      title="Privacy Policy"
      lastUpdated={lastUpdated}
      intro={
        <p>
          {operator.serviceName} ({operator.siteUrl}) helps people find jobs and keep track of their applications, and helps
          employers post jobs and review applications. This policy explains what personal data we handle to do that, why,
          who else sees it and what you can ask of us. It covers the website, the emails we send and the interview
          invitations.
        </p>
      }
      sections={[
        whoWeAre(operator),
        whatWeCollect(),
        howWeUseIt(),
        whoSeesIt(),
        googleData(operator),
        whereDataIsProcessed(),
        howLongWeKeepIt(),
        yourRights(operator),
        cookies(),
        security(),
        ageLimit(operator),
        changesToPolicy(),
      ]}
    />
  );
}
