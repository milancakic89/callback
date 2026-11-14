import Link from "next/link";
import type { LegalSectionContent } from "@/components/legal/legal-document";
import { ContactLink, ExternalLink } from "@/components/legal/legal-links";
import { GOOGLE_PRIVACY_POLICY_URL } from "@/components/legal/privacy-google-section";
import { LEGAL_LINKS, type LegalOperator } from "@/lib/legal/constants";

// The parts of the Privacy Policy about the data itself: who is responsible, what is collected, why,
// and who sees it (features/legal-pages.md). Each statement is one the code makes true; the plan lists
// where each comes from. The other parts are in privacy-google-section.tsx and
// privacy-rights-sections.tsx; privacy-policy.tsx puts them in order, and the parts refer to each other
// by number ("part 4"), which privacy-policy.test.ts keeps right.

export function whoWeAre(operator: LegalOperator): LegalSectionContent {
  return {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          {operator.serviceName} is run by {operator.operatorName}, {operator.operatorStatus} in {operator.country}.{" "}
          {operator.operatorName} is the controller of the personal data described in this policy, under the Serbian Law
          on Personal Data Protection and, for people in the European Economic Area, the GDPR.
        </p>
        <p>
          Write to <ContactLink email={operator.contactEmail} /> for anything about your data: a question, a copy of what
          we hold, a correction, deleting your account, or a complaint.
        </p>
        <p>
          When a candidate applies for a job, the employer who posted it receives the application and decides on its own
          what to do with it. For that, the employer is a separate controller (see part 4).
        </p>
      </>
    ),
  };
}

export function whatWeCollect(): LegalSectionContent {
  return {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <p>
          <strong>Everyone with an account</strong>
        </p>
        <ul>
          <li>
            Your email address and your password. We never see your password: our sign-in provider keeps only a hash of
            it.
          </li>
          <li>Whether you signed up as a candidate or as an employer.</li>
        </ul>
        <p>
          <strong>Candidates</strong>
        </p>
        <ul>
          <li>Your name and location.</li>
          <li>The CVs (PDF files) you upload to your account, and the cover letters you upload or type.</li>
          <li>
            Your applications: the job, the date, the CV and cover letter you sent, the status the employer shows you, and
            whether you withdrew.
          </li>
          <li>The jobs you save.</li>
        </ul>
        <p>
          <strong>Employers</strong>
        </p>
        <ul>
          <li>Your company&rsquo;s name, its address on Callback and its public profile.</li>
          <li>The jobs you post, and the statuses you define and set for candidates.</li>
          <li>Your review of applications, such as which ones you have opened or marked.</li>
          <li>
            The interview invitations you send: the time, the length and your message. If you connect Google, see part 5.
          </li>
        </ul>
        <p>
          <strong>Collected automatically</strong>
        </p>
        <ul>
          <li>
            Your IP address, kept in a counter that limits abusive traffic. When you sign in, choose an account type or
            ask to reset a password, the email address you typed is kept in such a counter too. Our server may also keep
            ordinary technical logs (address, time, page requested) for security and for finding faults.
          </li>
          <li>The cookies listed in part 9.</li>
        </ul>
        <p>
          Callback also shows public job listings collected from other job boards. They describe jobs and the businesses
          that publish them, and they belong to their publishers.
        </p>
      </>
    ),
  };
}

export function howWeUseIt(): LegalSectionContent {
  return {
    id: "how-we-use-it",
    title: "How we use it, and on what ground",
    body: (
      <>
        <p>We use personal data only for these purposes, each on the legal ground named:</p>
        <ul>
          <li>
            <strong>Running your account and the service</strong>: signing you in, letting a candidate apply and follow an
            application, letting an employer post jobs and review applications. Ground: performing our agreement with you
            (the <Link href={LEGAL_LINKS.terms.href}>{LEGAL_LINKS.terms.label}</Link>).
          </li>
          <li>
            <strong>Emailing you</strong>: confirming your sign-up, resetting a password and, when an employer invites a
            candidate to an interview, the invitation, the confirmation the candidate gets once they confirm and the
            answer the employer is told. Ground: the same agreement.
          </li>
          <li>
            <strong>Keeping Callback safe</strong>: limiting abusive traffic, preventing fraud and fixing faults. Ground:
            our legitimate interest in a service that works and is secure.
          </li>
          <li>
            <strong>Connecting an employer&rsquo;s Google Calendar</strong>, only when the employer chooses to. Ground: the
            employer&rsquo;s consent, which it can withdraw at any time by disconnecting.
          </li>
          <li>
            <strong>Meeting legal duties</strong>, when the law requires it. Ground: legal obligation.
          </li>
        </ul>
        <p>
          We don&rsquo;t sell personal data, show advertising or build advertising profiles, and we don&rsquo;t use your
          documents to train artificial-intelligence models.
        </p>
        <p>
          Smart Screening compares the words of a CV with the requirements of a job and shows the result to the employer as
          an aid. It decides nothing about you: the employer reads and judges every application.
        </p>
      </>
    ),
  };
}

export function whoSeesIt(): LegalSectionContent {
  return {
    id: "who-sees-it",
    title: "Who sees your data",
    body: (
      <ul>
        <li>
          <strong>The employer you apply to</strong> sees your application: your name and location, the date, your CV and
          your cover letter. No other employer does. What an employer does with an application once it has it is its own
          responsibility, and our Terms limit it to the job you applied for.
        </li>
        <li>
          <strong>Anyone</strong> can see an employer&rsquo;s company page and the jobs it has published. Nothing about
          candidates is public.
        </li>
        <li>
          <strong>Providers that process data for us</strong>, only to run Callback and only on our instructions:
          <ul>
            <li>Supabase: our database and sign-in.</li>
            <li>Cloudflare R2: private storage for CVs and cover letters, in its EU jurisdiction.</li>
            <li>
              Google: Gmail&rsquo;s mail service sends our emails, and Google Calendar and Google Meet are used when an
              employer connects Google (part 5).
            </li>
            <li>Contabo: the company that hosts the server Callback runs on, in Europe.</li>
          </ul>
        </li>
        <li>
          <strong>When an employer invites you to an interview</strong>, we email you the time, the length and any message
          from the employer. If you confirm, we email you again with the time and the Google Meet link, your email
          address is added as a guest to the event in the employer&rsquo;s calendar, so the employer&rsquo;s Google
          account shows it, and Google sends you the calendar invitation. The
          employer is told your answer, whichever it is. The call itself takes place on Google Meet, which Google runs
          under <ExternalLink href={GOOGLE_PRIVACY_POLICY_URL}>Google&rsquo;s Privacy Policy</ExternalLink>, not this
          one.
        </li>
        <li>
          <strong>Authorities</strong>, when the law requires us to disclose data.
        </li>
      </ul>
    ),
  };
}
