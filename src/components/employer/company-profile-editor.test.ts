import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveCompanyProfile } = vi.hoisted(() => ({ saveCompanyProfile: vi.fn() }));

// The action pulls in the server (Supabase, rate limiting); the form only needs it to exist.
vi.mock("@/app/(employer)/[company]/(workspace)/profile/actions", () => ({ saveCompanyProfile }));

import type { CompanyProfile } from "@/lib/companies/profile";
import { CompanyProfileEditor } from "./company-profile-editor";

const COMPANY = { name: "Acme d.o.o.", slug: "acme" };

const PROFILE: CompanyProfile = {
  ...COMPANY,
  description: "We make clinics run on time.",
  website: "https://acme.com",
  industry: "Healthcare software",
  size: "51-200",
  headquarters: "Belgrade, Serbia",
};

const render = (profile: CompanyProfile | null) =>
  renderToStaticMarkup(createElement(CompanyProfileEditor, { company: COMPANY, profile }));

beforeEach(() => vi.clearAllMocks());

describe("CompanyProfileEditor", () => {
  it("has a field for each part of the profile, named as the action reads them", () => {
    const html = render(null);

    for (const name of ["description", "website", "industry", "size", "headquarters"]) {
      expect(html, name).toContain(`name="${name}"`);
    }
    expect(html).toContain("Save profile");
    expect(html).toContain("Back to dashboard");
    expect(html).toContain('href="/acme"');
  });

  it("starts empty for a company with no profile, with a placeholder instead of the card", () => {
    const html = render(null);

    expect(html).toContain("Your company profile appears here as you type.");
    expect(html).not.toContain("About Acme d.o.o.");
    expect(html).toContain('<input type="hidden" name="size" value=""/>');
    expect(html).toContain("0 / 5,000");
  });

  it("starts with the saved profile in the fields and in the preview", () => {
    const html = render(PROFILE);

    expect(html).toContain("We make clinics run on time.");
    expect(html).toContain('value="https://acme.com"');
    expect(html).toContain('value="Healthcare software"');
    expect(html).toContain('value="Belgrade, Serbia"');
    expect(html).toContain('<input type="hidden" name="size" value="51-200"/>');
    expect(html).toContain("About Acme d.o.o.");
    expect(html).toContain("51-200 employees");
    expect(html).not.toContain("Your company profile appears here");
  });

  it("counts the description's characters against the limit", () => {
    expect(render(PROFILE)).toContain(`${PROFILE.description?.length} / 5,000`);
  });

  it("links to the company's public page", () => {
    const html = render(PROFILE);

    expect(html).toContain('href="/companies/acme"');
    expect(html).toContain("View your public company page");
  });
});
