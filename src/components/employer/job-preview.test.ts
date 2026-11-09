import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CompanyProfile } from "@/lib/companies/profile";
import { JobPreview } from "./job-preview";

const PROFILE: CompanyProfile = {
  name: "Acme d.o.o.",
  slug: "acme",
  description: "We make clinics run on time.",
  website: null,
  industry: "Healthcare software",
  size: null,
  headquarters: null,
};

const EMPTY_PROFILE: CompanyProfile = { ...PROFILE, description: null, industry: null };

const BASE = {
  title: "Senior Product Designer",
  description: "Own the design.",
  location: "Belgrade, Serbia",
  workMode: "HYBRID" as const,
  companyName: "Acme d.o.o.",
  companyProfile: PROFILE,
  profileEditHref: "/acme/profile",
};

const render = (props: Partial<Parameters<typeof JobPreview>[0]> = {}) =>
  renderToStaticMarkup(createElement(JobPreview, { ...BASE, ...props }));

describe("JobPreview", () => {
  it("shows the posting as typed", () => {
    const html = render();

    expect(html).toContain("Candidate preview");
    for (const text of ["Senior Product Designer", "Acme d.o.o.", "Own the design.", "Belgrade, Serbia", "Hybrid", "Upload CV"]) {
      expect(html, text).toContain(text);
    }
  });

  it("shows placeholders for what hasn't been typed yet", () => {
    const html = render({ title: "  ", description: "", location: "", workMode: null });

    expect(html).toContain("Job title");
    expect(html).toContain("The description appears here.");
    expect(html).not.toContain("Hybrid");
  });

  it("shows the description as text, never as HTML", () => {
    const html = render({ description: "<script>alert(1)</script>" });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows the company's 'About' card under the posting", () => {
    const html = render();

    expect(html).toContain("About Acme d.o.o.");
    expect(html).toContain("We make clinics run on time.");
    expect(html).toContain("Healthcare software");
    expect(html).not.toContain("Write your company profile");
  });

  it("invites the employer to write the profile while it is empty", () => {
    for (const companyProfile of [null, EMPTY_PROFILE]) {
      const html = render({ companyProfile });

      expect(html).not.toContain("About Acme d.o.o.");
      expect(html).toContain("Candidates will see your company description here.");
      expect(html).toContain('href="/acme/profile"');
      expect(html).toContain("Write your company profile");
    }
  });
});
