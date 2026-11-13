import { describe, expect, it } from "vitest";
import { APOSTROPHE, renderSection, TEST_OPERATOR } from "./legal-test-utils";
import { googleData, GOOGLE_PERMISSIONS_URL, GOOGLE_USER_DATA_POLICY_URL } from "./privacy-google-section";

describe("googleData", () => {
  const html = renderSection(googleData(TEST_OPERATOR));

  it("says whose data it is about: an employer's, never a candidate's", () => {
    expect(html).toContain("An employer can connect a Google account");
    expect(html).toContain("A candidate never signs in with Google");
  });

  it("says what is received and kept: the account's email and a refresh token, nothing else", () => {
    expect(html).toContain("The email address of the Google account");
    expect(html).toContain("A refresh token");
  });

  it("names the one calendar permission and what it is used for", () => {
    expect(html).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(html).toContain("primary calendar");
    expect(html).toContain("add the candidate as a guest once the candidate confirms");
    expect(html).toContain("delete that event if the candidate declines, the invitation expires or the employer cancels it");
  });

  it("says other events are never read or changed", () => {
    expect(html).toContain(`We don${APOSTROPHE}t read, list or search your other events`);
    expect(html).toContain("never change an event");
  });

  // Google's required wording for the Limited Use requirements; the verification reads for it.
  it("has Google's Limited Use statement, with a link to the policy", () => {
    expect(html).toContain("information received from Google APIs will adhere to the");
    expect(html).toContain("Google API Services User Data Policy");
    expect(html).toContain("including the Limited Use requirements");
    expect(html).toContain(`href="${GOOGLE_USER_DATA_POLICY_URL}"`);
  });

  it("limits what the data is used for: no transfer, no reading by people, no advertising, sale or AI training", () => {
    expect(html).toContain("only to provide this interview feature");
    expect(html).toContain(`We don${APOSTROPHE}t transfer it`);
    expect(html).toContain("No person reads it");
    expect(html).toContain("advertising");
    expect(html).toContain(`we don${APOSTROPHE}t sell it`);
    expect(html).toContain("train");
  });

  it("says how the token is protected and how to remove it, at Google as well", () => {
    expect(html).toContain("AES-256-GCM");
    expect(html).toContain("revokes the token at Google and deletes it from our database");
    expect(html).toContain(`href="${GOOGLE_PERMISSIONS_URL}"`);
  });

  it("says disconnecting leaves the events already created in the calendar", () => {
    expect(html).toContain("Events already created stay in your calendar");
  });

  it("opens Google's pages in a new tab that can't reach back", () => {
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
  });

  it("uses the service's name from the operator it is given", () => {
    expect(html).toContain("connect a Google account to Callback");
  });
});
