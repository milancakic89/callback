import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CompanyProfile } from "@/lib/companies/profile";
import { CompanyAbout, CompanyAboutPlaceholder } from "./company-about";

const PROFILE: CompanyProfile = {
  name: "Acme d.o.o.",
  slug: "acme",
  description: "We make clinics run on time.\nSecond paragraph.",
  website: "https://www.acme.com/about",
  industry: "Healthcare software",
  size: "51-200",
  headquarters: "Belgrade, Serbia",
};

const render = (profile: CompanyProfile, children?: string) =>
  renderToStaticMarkup(createElement(CompanyAbout, { profile }, children));

describe("CompanyAbout", () => {
  it("is headed 'About {company}' and shows the description and every fact", () => {
    const html = render(PROFILE);

    expect(html).toContain("About Acme d.o.o.");
    expect(html).toContain("We make clinics run on time.");
    for (const text of ["Industry", "Healthcare software", "Company size", "51-200 employees", "Headquarters", "Belgrade, Serbia"]) {
      expect(html, text).toContain(text);
    }
  });

  it("links the website safely, labelled by its host", () => {
    const html = render(PROFILE);

    expect(html).toContain('href="https://www.acme.com/about"');
    expect(html).toContain(">acme.com</a>");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
  });

  it("shows the description as text, never as HTML", () => {
    const html = render({ ...PROFILE, description: '<img src=x onerror="alert(1)"><script>alert(2)</script>' });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps the description's line breaks", () => {
    expect(render(PROFILE)).toContain("whitespace-pre-wrap");
  });

  it("leaves out what the company didn't fill in", () => {
    const html = render({ ...PROFILE, description: null, website: null, industry: null, size: null });

    expect(html).toContain("Headquarters");
    for (const text of ["Industry", "Company size", "Website", "<a "]) expect(html, text).not.toContain(text);
  });

  it("shows what it is given under the text", () => {
    expect(render(PROFILE, "View company profile")).toContain("View company profile");
  });
});

describe("CompanyAboutPlaceholder", () => {
  it("shows its message in a dashed box", () => {
    const html = renderToStaticMarkup(createElement(CompanyAboutPlaceholder, null, "Your profile appears here."));

    expect(html).toContain("Your profile appears here.");
    expect(html).toContain("border-dashed");
  });
});
