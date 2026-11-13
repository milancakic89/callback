import { describe, expect, it } from "vitest";
import { APOSTROPHE, renderSection, TEST_OPERATOR } from "./legal-test-utils";
import {
  ageLimit,
  changesToPolicy,
  cookies,
  howLongWeKeepIt,
  security,
  SERBIAN_COMMISSIONER_URL,
  whereDataIsProcessed,
  yourRights,
} from "./privacy-rights-sections";

describe("whereDataIsProcessed", () => {
  const html = renderSection(whereDataIsProcessed());

  it("says some providers may process data outside Serbia and the EEA, under standard contractual clauses", () => {
    expect(html).toContain("outside Serbia and the European Economic Area");
    expect(html).toContain("standard contractual clauses");
  });
});

describe("howLongWeKeepIt", () => {
  const html = renderSection(howLongWeKeepIt());

  it("keeps an account for as long as it exists and deletes it on request", () => {
    expect(html).toContain("for as long as the account exists");
    expect(html).toContain("We delete an account and its data when you ask");
  });

  it("says a withdrawn application's documents are removed, and the Google connection lasts until disconnected", () => {
    expect(html).toContain("its documents are removed from it");
    expect(html).toContain("until the employer disconnects it");
  });

  // No period is claimed that nothing in the app enforces (features/legal-pages.md).
  it("promises no fixed retention period", () => {
    expect(html).not.toMatch(/\d+\s+(days?|weeks?|months?|years?)/i);
  });
});

describe("yourRights", () => {
  const html = renderSection(yourRights(TEST_OPERATOR));

  it("lists the rights: a copy, correction, deletion, restriction and objection, portability, and withdrawing consent", () => {
    for (const right of [
      "give you a copy",
      "correct data",
      "delete your data",
      "restrict how we use your data",
      "object to a use",
      "in a form you can take elsewhere",
      "stop a use that rests on your consent",
    ]) {
      expect(html, right).toContain(right);
    }
  });

  it("gives the address to write to and the time to answer", () => {
    expect(html).toContain('href="mailto:privacy@example.test"');
    expect(html).toContain("within 30 days");
  });

  it("names the regulator to complain to, and the EEA's authorities", () => {
    expect(html).toContain("Commissioner for Information of Public Importance and Personal Data Protection");
    expect(html).toContain(`href="${SERBIAN_COMMISSIONER_URL}"`);
    expect(html).toContain("European Economic Area");
  });

  it("says what a person can do in the app themselves, with no promise of a delete button", () => {
    expect(html).toContain("withdraw an application");
    expect(html).toContain("disconnect Google");
    expect(html).not.toMatch(/delete (your )?account (in|from) (the )?(app|settings)/i);
  });
});

describe("cookies", () => {
  const html = renderSection(cookies());

  it("lists the three cookies the app sets", () => {
    expect(html).toContain("sb-…-auth-token");
    expect(html).toContain("cb_pending_signup");
    expect(html).toContain("cb_google_state");
  });

  it("says there are no advertising or analytics cookies and so no banner", () => {
    expect(html).toContain("no advertising or analytics cookies");
    expect(html).toContain("no cookie banner");
  });
});

describe("security", () => {
  const html = renderSection(security());

  it("says what protects the data, without claiming perfection", () => {
    expect(html).toContain("HTTPS");
    expect(html).toContain("private storage");
    expect(html).toContain("Google tokens are encrypted");
    expect(html).toContain("No system is perfectly secure");
  });
});

describe("ageLimit", () => {
  it("says the service is not meant for anyone under 16 and what happens if a child has an account", () => {
    const html = renderSection(ageLimit(TEST_OPERATOR));

    expect(html).toContain("not meant for anyone under 16");
    expect(html).toContain(`we don${APOSTROPHE}t knowingly collect their data`);
    expect(html).toContain("we will delete it");
  });
});

describe("changesToPolicy", () => {
  it("says the date at the top changes, and account holders are told of a change that matters", () => {
    const html = renderSection(changesToPolicy());

    expect(html).toContain("update the date at the top");
    expect(html).toContain("tell account holders by email");
  });
});
