import Link from "next/link";
import { LegalDocument, type LegalSectionContent } from "@/components/legal/legal-document";
import { ContactLink } from "@/components/legal/legal-links";
import { LEGAL_LINKS, type LegalOperator } from "@/lib/legal/constants";

// The Terms of Service (features/legal-pages.md). The statements about what Callback does are the ones the
// app makes true today (a free service, two kinds of account, listings from other boards, Google
// Calendar for interviews); a new feature that changes them needs a change here and a new date in
// src/lib/legal/constants.ts.
function sectionsOf(operator: LegalOperator): LegalSectionContent[] {
  return [
    {
      id: "about",
      title: "About these terms",
      body: (
        <>
          <p>
            These terms are the agreement between you and {operator.operatorName}, {operator.operatorStatus} in{" "}
            {operator.country}, who runs {operator.serviceName} at {operator.siteUrl}. In these terms, &ldquo;we&rdquo;
            means {operator.operatorName}. By creating an account or using {operator.serviceName} you accept them. If you
            don&rsquo;t, please don&rsquo;t use it.
          </p>
          <p>
            How we handle personal data is in the <Link href={LEGAL_LINKS.privacy.href}>{LEGAL_LINKS.privacy.label}</Link>,
            which is part of this agreement.
          </p>
        </>
      ),
    },
    {
      id: "the-service",
      title: "What Callback is",
      body: (
        <p>
          {operator.serviceName} is a job board and an application tracker. Candidates browse jobs, apply with a CV and a
          cover letter, and follow what happens to each application. Employers post jobs, receive applications and review
          them, set a status for each candidate, and can invite candidates to an interview through Google Calendar and
          Google Meet. {operator.serviceName} also lists jobs collected from other job boards; those belong to their
          publishers (part 8).
        </p>
      ),
    },
    {
      id: "your-account",
      title: "Your account",
      body: (
        <ul>
          <li>
            You must be at least 16 and old enough under the law where you live to enter into an agreement. An employer
            account must be opened by someone allowed to act for the company it names.
          </li>
          <li>Give accurate information and keep it up to date.</li>
          <li>
            Keep your password to yourself. You are responsible for what happens under your account, so tell us at once if
            someone else has got into it.
          </li>
          <li>An account is either a candidate account or an employer account.</li>
        </ul>
      ),
    },
    {
      id: "candidates",
      title: "If you are a candidate",
      body: (
        <ul>
          <li>What you put in your CV, cover letter and profile must be true, and yours to share.</li>
          <li>
            When you apply, the employer receives your application, as the Privacy Policy describes. You can withdraw it
            at any time, and the employer can then no longer open your documents.
          </li>
          <li>
            {operator.serviceName} doesn&rsquo;t promise that an employer will answer, interview or hire you. A job offer
            or an employment contract is only ever between you and the employer.
          </li>
        </ul>
      ),
    },
    {
      id: "employers",
      title: "If you are an employer",
      body: (
        <ul>
          <li>
            Post only real jobs that you are entitled to fill, described accurately. Don&rsquo;t post a job that
            discriminates on a ground the law forbids.
          </li>
          <li>
            You decide why and how you use the applications you receive, so you are responsible for handling them lawfully.
            Use an applicant&rsquo;s data only to assess them and to contact them about the job they applied for. Don&rsquo;t
            sell it or pass it on, and delete it when you no longer need it or when the law requires.
          </li>
          <li>
            Send interview invitations only to people who applied to you. If you connect a Google account, it must be one
            you are entitled to use for this, and Google&rsquo;s own terms apply to it.
          </li>
          <li>
            Don&rsquo;t use {operator.serviceName} to contact candidates about anything other than the job they applied
            for.
          </li>
        </ul>
      ),
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      body: (
        <>
          <p>Don&rsquo;t:</p>
          <ul>
            <li>break the law, or help someone else to;</li>
            <li>post a false or misleading job, or send an application that is not yours;</li>
            <li>upload anything you have no right to share, or anything that contains malware;</li>
            <li>pretend to be another person or company;</li>
            <li>
              probe or test the security of {operator.serviceName}, get around its limits, or send automated requests in
              numbers that burden it;
            </li>
            <li>harass other users.</li>
          </ul>
        </>
      ),
    },
    {
      id: "your-content",
      title: "Your content",
      body: (
        <p>
          You keep ownership of what you upload or write: CVs, cover letters, your profile and your job posts. You give us
          permission to store, process and show it, and to pass it to the employer or candidate it is meant for, only as
          far as we need to in order to run {operator.serviceName}. That permission ends when you delete the content or your
          account, except for copies an employer has already received.
        </p>
      ),
    },
    {
      id: "listings-and-other-services",
      title: "Job listings and other services",
      body: (
        <p>
          Job listings collected from other job boards belong to their publishers. We don&rsquo;t check them: a listing may
          be out of date, closed or wrong, and following it takes you to a site we don&rsquo;t control. {operator.serviceName}{" "}
          also relies on other services, such as Google Calendar and Google Meet and our sign-in and hosting providers.
          They work under their own terms, and we are not responsible for what they do or for when they are down.
        </p>
      ),
    },
    {
      id: "the-service-as-it-is",
      title: "The service as it is",
      body: (
        <p>
          {operator.serviceName} is an early product. We may add, change or remove features, and some are marked
          &ldquo;coming soon&rdquo;. It is free to use today; if we ever charge for something, we will say so before you are
          asked to pay.
        </p>
      ),
    },
    {
      id: "ending-your-account",
      title: "Ending your account",
      body: (
        <p>
          You can stop using {operator.serviceName} at any time, withdraw your applications, and ask us to delete your
          account by writing to <ContactLink email={operator.contactEmail} />. We may suspend or close an account that breaks
          these terms or abuses the service, and we will tell you why when we can.
        </p>
      ),
    },
    {
      id: "liability",
      title: "Liability",
      body: (
        <>
          <p>
            {operator.serviceName} is provided free and as it is. We don&rsquo;t promise that it will always be available or
            free of errors, that a job listing is accurate or still open, or that an application will get an answer. We are
            not a party to any job offer or employment contract between a candidate and an employer.
          </p>
          <p>
            To the extent the law allows, we are not liable for indirect or consequential loss, or for loss caused by a
            candidate or an employer, by another site, or by a service we rely on, such as Google. Nothing in these terms
            limits a liability that the law doesn&rsquo;t allow to be limited, such as for intent or gross negligence, or
            the rights a consumer has under mandatory law.
          </p>
        </>
      ),
    },
    {
      id: "governing-law",
      title: "Governing law",
      body: (
        <p>
          These terms are governed by the law of the Republic of Serbia. A dispute goes to the competent court in Serbia,
          unless mandatory consumer-protection law gives you the right to go elsewhere.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes to these terms",
      body: (
        <p>
          We may change these terms. We will update the date at the top and, for a change that matters, tell account holders
          by email before it applies. If you keep using {operator.serviceName} after that, you accept the new terms; if you
          don&rsquo;t agree, you can close your account.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Contact",
      body: (
        <p>
          Questions about these terms: <ContactLink email={operator.contactEmail} />.
        </p>
      ),
    },
  ];
}

export function TermsOfService({ operator, lastUpdated }: { operator: LegalOperator; lastUpdated: string }) {
  return (
    <LegalDocument
      title="Terms of Service"
      lastUpdated={lastUpdated}
      intro={
        <p>
          The rules for using {operator.serviceName}, for candidates and for employers. Please read them with the{" "}
          <Link href={LEGAL_LINKS.privacy.href}>{LEGAL_LINKS.privacy.label}</Link>.
        </p>
      }
      sections={sectionsOf(operator)}
    />
  );
}
