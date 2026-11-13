import type { LegalSectionContent } from "@/components/legal/legal-document";
import { ContactLink, ExternalLink } from "@/components/legal/legal-links";
import type { LegalOperator } from "@/lib/legal/constants";

export const SERBIAN_COMMISSIONER_URL = "https://www.poverenik.rs";

// The last parts of the Privacy Policy (features/legal-pages.md): where data goes, how long it stays, what
// you may ask for, cookies, security, children and changes. The cookie names are the ones the code
// sets: Supabase's session cookie, cb_pending_signup (src/lib/auth/pending-signup.ts) and cb_google_state
// (src/lib/google/oauth.ts). A new cookie needs a line here. Nothing here promises a retention period
// or a self-service delete button the app doesn't have.

export function whereDataIsProcessed(): LegalSectionContent {
  return {
    id: "where-data-is-processed",
    title: "Where data is processed",
    body: (
      <p>
        Our server is in Europe. Some of our providers, including Google and Supabase, may process data in other
        countries, including outside Serbia and the European Economic Area. Where they do, we rely on the safeguards the law
        provides for such transfers, such as standard contractual clauses.
      </p>
    ),
  };
}

export function howLongWeKeepIt(): LegalSectionContent {
  return {
    id: "how-long-we-keep-it",
    title: "How long we keep it",
    body: (
      <ul>
        <li>We keep your account and what is in it for as long as the account exists.</li>
        <li>
          When a candidate withdraws an application, its documents are removed from it, and the employer can no longer
          open them.
        </li>
        <li>
          We delete an account and its data when you ask (see part 8), without undue delay, except for what the law
          requires us to keep.
        </li>
        <li>An employer&rsquo;s Google connection lasts until the employer disconnects it (see part 5).</li>
        <li>
          Counters that limit abusive traffic hold an IP address, an account&rsquo;s id or, for signing in, choosing an
          account type and resetting a password, the email address typed in, together with a number of requests and when
          the count starts again, and nothing else.
        </li>
      </ul>
    ),
  };
}

export function yourRights(operator: LegalOperator): LegalSectionContent {
  return {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <p>You can ask us to:</p>
        <ul>
          <li>tell you whether we hold data about you, and give you a copy;</li>
          <li>correct data that is wrong or incomplete;</li>
          <li>delete your data, including your account;</li>
          <li>restrict how we use your data, or object to a use that rests on our legitimate interest;</li>
          <li>give you the data you provided, in a form you can take elsewhere;</li>
          <li>stop a use that rests on your consent, at any time. What we did before you withdrew it stays lawful.</li>
        </ul>
        <p>
          Write to <ContactLink email={operator.contactEmail} />. We answer within 30 days, and we may need to check that
          the request comes from you. Some things you can do yourself in the app: change your profile and CVs, withdraw an
          application, and disconnect Google.
        </p>
        <p>
          If you think we handle your data unlawfully, you can complain to the Commissioner for Information of Public
          Importance and Personal Data Protection of Serbia (<ExternalLink href={SERBIAN_COMMISSIONER_URL}>poverenik.rs</ExternalLink>),
          or, if you are in the European Economic Area, to the data protection authority of your country. We would like the
          chance to put it right first.
        </p>
      </>
    ),
  };
}

export function cookies(): LegalSectionContent {
  return {
    id: "cookies",
    title: "Cookies",
    body: (
      <>
        <p>
          We set only the cookies the site needs to work. There are no advertising or analytics cookies and no third-party
          trackers, so there is no cookie banner.
        </p>
        <ul>
          <li>
            <code>sb-…-auth-token</code>: keeps you signed in. It is set by our sign-in provider and removed when you
            sign out.
          </li>
          <li>
            <code>cb_pending_signup</code>: short-lived and encrypted. It remembers, while you choose between a candidate
            and an employer account, that you have just signed up.
          </li>
          <li>
            <code>cb_google_state</code>: short-lived. It protects an employer&rsquo;s connection to Google from being
            forged.
          </li>
        </ul>
      </>
    ),
  };
}

export function security(): LegalSectionContent {
  return {
    id: "security",
    title: "Security",
    body: (
      <>
        <p>
          All traffic uses HTTPS. CVs and cover letters are kept in private storage and opened only through the app, for the
          people allowed to see them. The database lets a person read only their own data, and an employer only the
          applications to its own jobs. Google tokens are encrypted.
        </p>
        <p>
          No system is perfectly secure. If a breach puts your rights at risk, we will tell you and the Commissioner as the
          law requires.
        </p>
      </>
    ),
  };
}

export function ageLimit(operator: LegalOperator): LegalSectionContent {
  return {
    id: "children",
    title: "Children",
    body: (
      <p>
        {operator.serviceName} is for adults looking for work. It is not meant for anyone under 16, and we don&rsquo;t
        knowingly collect their data. If you think a child has an account, write to us and we will delete it.
      </p>
    ),
  };
}

export function changesToPolicy(): LegalSectionContent {
  return {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        When we change this policy we update the date at the top and, for a change that matters, tell account holders by
        email before it applies.
      </p>
    ),
  };
}
