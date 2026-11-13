import { describe, expect, it } from "vitest";
import { howWeUseIt, whatWeCollect, whoSeesIt, whoWeAre } from "./privacy-data-sections";
import { APOSTROPHE, renderSection, TEST_OPERATOR } from "./legal-test-utils";

describe("whoWeAre", () => {
  const html = renderSection(whoWeAre(TEST_OPERATOR));

  it("names who runs the service, what they are and where, from the operator it is given", () => {
    expect(html).toContain("Callback is run by Ana Test, a private person in Freedonia.");
    expect(html).toContain("Ana Test is the controller of the personal data");
  });

  it("says which laws apply", () => {
    expect(html).toContain("Serbian Law on Personal Data Protection");
    expect(html).toContain("GDPR");
  });

  it("gives the address to write to for every request, as a mailto link", () => {
    expect(html).toContain('href="mailto:privacy@example.test"');
  });

  it("says an employer who receives an application is a controller of its own", () => {
    expect(html).toContain("separate controller");
  });
});

describe("whatWeCollect", () => {
  const html = renderSection(whatWeCollect());

  it("lists what every account, a candidate and an employer give", () => {
    for (const text of ["Your email address and your password", "Candidates", "Employers", "Your name and location"]) {
      expect(html, text).toContain(text);
    }
    expect(html).toContain("CVs (PDF files)");
    expect(html).toContain("cover letters");
    expect(html).toContain("interview invitations you send");
  });

  it("says passwords are never seen, only hashed", () => {
    expect(html).toContain("We never see your password");
    expect(html).toContain("only a hash");
  });

  it("owns up to the IP address kept in the rate-limit counter, and to server logs", () => {
    expect(html).toContain("Your IP address, kept in a counter that limits abusive traffic");
    expect(html).toContain("technical logs");
  });

  it("says the listings from other boards are their publishers", () => {
    expect(html).toContain("belong to their publishers");
  });
});

describe("howWeUseIt", () => {
  const html = renderSection(howWeUseIt());

  it("gives a legal ground for every purpose", () => {
    expect(html.match(/Ground:/g)).toHaveLength(5);
    for (const ground of ["performing our agreement", "legitimate interest", "consent", "legal obligation"]) {
      expect(html, ground).toContain(ground);
    }
  });

  it("links the Terms the agreement refers to", () => {
    expect(html).toContain('href="/terms"');
    expect(html).toContain("Terms of Service");
  });

  it("promises no sale, no advertising and no training of AI models on documents", () => {
    expect(html).toContain(`We don${APOSTROPHE}t sell personal data`);
    expect(html).toContain("advertising");
    expect(html).toContain("artificial-intelligence models");
  });

  it("says Smart Screening decides nothing about a candidate", () => {
    expect(html).toContain("Smart Screening");
    expect(html).toContain("It decides nothing about you");
  });
});

describe("whoSeesIt", () => {
  const html = renderSection(whoSeesIt());

  it("says the employer applied to sees the application, and no other employer", () => {
    expect(html).toContain("The employer you apply to");
    expect(html).toContain("No other employer does");
    expect(html).toContain("Nothing about candidates is public");
  });

  it("names each provider that processes data, and what for", () => {
    for (const provider of ["Supabase", "Cloudflare R2", "Google", "Contabo"]) {
      expect(html, provider).toContain(provider);
    }
    expect(html).toContain("EU jurisdiction");
  });

  it("says that a candidate who confirms an interview shows their email to the employer", () => {
    expect(html).toContain("your email address is added as a guest");
    expect(html).toContain(`employer${APOSTROPHE}s Google account shows it`);
  });
});
