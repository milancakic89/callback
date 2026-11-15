import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { howLongWeKeepIt } from "./privacy-rights-sections";
import { whatWeCollect } from "./privacy-data-sections";
import { ExtensionData } from "./privacy-extension-block";
import { APOSTROPHE, renderSection } from "./legal-test-utils";

const html = renderToStaticMarkup(createElement(ExtensionData));

describe("ExtensionData", () => {
  it("says what the extension reads, on which sites, and nothing else", () => {
    expect(html).toContain("If you use the Callback browser extension");
    expect(html).toContain("LinkedIn, HelloWorld or Infostud");
    for (const field of ["address", "title", "company", "location"]) expect(html, field).toContain(field);
    expect(html).toContain("It reads nothing else, and nothing on any other site");
  });

  it("says it sends the job only when the button is clicked, as the address of a page on Callback", () => {
    expect(html).toContain("only when you click");
    expect(html).toContain("Add to Callback");
    expect(html).toContain("the details travel in the address of a page on Callback");
    expect(html).toContain("sends nothing in the background");
  });

  it("says opening the page saves nothing and a job can be removed", () => {
    expect(html).toContain("Opening that page saves nothing");
    expect(html).toContain("only when you press Save");
    expect(html).toContain("remove a job you added this way from your list at any time");
  });

  it("says it has no other permissions, stores nothing, sets no cookies, tracks nothing and tells no third party", () => {
    expect(html).toContain("no permission beyond running on those pages");
    expect(html).toContain("stores nothing in your browser");
    expect(html).toContain("sets no cookies");
    expect(html).toContain("no tracking");
    expect(html).toContain("sends nothing to anyone else");
    expect(html).toContain(`the site you are on isn${APOSTROPHE}t told`);
  });
});

describe("the policy's other parts, for the extension", () => {
  it("lists the jobs a candidate adds from other sites among what is collected, and shows the extension's part", () => {
    const collected = renderSection(whatWeCollect());

    expect(collected).toContain("The jobs you add from other sites, such as LinkedIn, HelloWorld and Infostud");
    expect(collected).toContain("the CV you choose for it, if any");
    expect(collected).toContain("If you use the Callback browser extension");
  });

  it("keeps such a job until the candidate removes it or the account is deleted", () => {
    expect(renderSection(howLongWeKeepIt())).toContain("A job you added from another site stays on your list until you remove it");
  });
});
