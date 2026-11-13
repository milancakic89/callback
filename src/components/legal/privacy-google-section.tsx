import type { LegalSectionContent } from "@/components/legal/legal-document";
import { ExternalLink } from "@/components/legal/legal-links";
import type { LegalOperator } from "@/lib/legal/constants";

export const GOOGLE_USER_DATA_POLICY_URL = "https://developers.google.com/terms/api-services-user-data-policy";
export const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";

// The part of the Privacy Policy Google's app verification reads (features/legal-pages.md): what an
// employer's Google data is used for, kept as, and how it is removed. What it says about the calendar
// matches src/lib/google/calendar.ts: events Callback created, and nothing else. The Limited Use
// sentence is Google's required wording; privacy-google-section.test.ts keeps it.
export function googleData(operator: LegalOperator): LegalSectionContent {
  return {
    id: "google-data",
    title: "Google user data",
    body: (
      <>
        <p>
          An employer can connect a Google account to {operator.serviceName}, so that an interview invitation creates a
          Google Meet event in the employer&rsquo;s own calendar. This part covers the data we receive from Google when
          it does. A candidate never signs in with Google, and none of this applies to candidates.
        </p>
        <p>
          <strong>What we receive and keep</strong>
        </p>
        <ul>
          <li>
            The email address of the Google account, shown in Settings so the employer knows which account is connected.
          </li>
          <li>A refresh token, which lets our server act on that calendar until the employer disconnects.</li>
        </ul>
        <p>
          <strong>What we do with the calendar</strong>
        </p>
        <p>
          We ask for one calendar permission, <code>https://www.googleapis.com/auth/calendar.events</code>, and use it only to:
        </p>
        <ul>
          <li>create an event with a Google Meet link in the account&rsquo;s primary calendar when the employer sends an invitation;</li>
          <li>add the candidate as a guest once the candidate confirms, so Google sends them the invitation;</li>
          <li>delete that event if the candidate declines, the invitation expires or the employer cancels it.</li>
        </ul>
        <p>
          We don&rsquo;t read, list or search your other events, and we never change an event that {operator.serviceName}{" "}
          didn&rsquo;t create.
        </p>
        <p>
          <strong>Limited Use</strong>
        </p>
        <p>
          {operator.serviceName}&rsquo;s use and transfer to any other app of information received from Google APIs will
          adhere to the <ExternalLink href={GOOGLE_USER_DATA_POLICY_URL}>Google API Services User Data Policy</ExternalLink>,
          including the Limited Use requirements. In plain words:
        </p>
        <ul>
          <li>We use the data only to provide this interview feature to the employer who connected the account.</li>
          <li>
            We don&rsquo;t transfer it to anyone else, except to provide the feature (Google itself), to follow the law,
            or to keep the service secure.
          </li>
          <li>
            No person reads it, unless you ask us to, it is needed to investigate abuse or a security problem, or the law
            requires it.
          </li>
          <li>
            We don&rsquo;t use it for advertising, we don&rsquo;t sell it, and we don&rsquo;t use it to train
            artificial-intelligence models.
          </li>
        </ul>
        <p>
          <strong>How it is protected, and how to remove it</strong>
        </p>
        <ul>
          <li>
            The refresh token is encrypted (AES-256-GCM) before it is stored, with a key that is not kept in the database,
            and only our server can read it.
          </li>
          <li>
            <strong>Disconnect</strong> in Settings revokes the token at Google and deletes it from our database. You can
            also remove {operator.serviceName}&rsquo;s access yourself at{" "}
            <ExternalLink href={GOOGLE_PERMISSIONS_URL}>your Google account&rsquo;s permissions page</ExternalLink>.
          </li>
          <li>
            Events already created stay in your calendar. They are yours to keep or delete, and disconnecting does not
            remove them.
          </li>
        </ul>
      </>
    ),
  };
}
