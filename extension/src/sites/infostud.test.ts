// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { documentFrom, loadFixture } from "../test-support/fixtures";
import { infostud } from "./infostud";

const JOB_URL = "https://poslovi.infostud.com/posao/accounting-officer/slvwz-doo/765278";

describe("the Infostud adapter", () => {
  it("reads the job from its JSON-LD JobPosting, among the page's other JSON-LD", () => {
    expect(infostud.readJob(loadFixture("infostud-job.html"), new URL(JOB_URL))).toEqual({
      url: JOB_URL,
      title: "Accounting Officer",
      company: "SLVWZ d.o.o.",
      location: "Beograd, Srbija, RS",
    });
  });

  it("takes the address from the tab, without its query", () => {
    const job = infostud.readJob(loadFixture("infostud-job.html"), new URL(`${JOB_URL}?esource=job#x`));

    expect(job?.url).toBe(JOB_URL);
  });

  it("finds the job's 'Konkurišite' button, the link to its application", () => {
    const control = infostud.findApplyControl(loadFixture("infostud-job.html"));

    expect(control?.textContent).toContain("Konkurišite");
    expect(control?.getAttribute("href")).toContain("/konkurs/765278");
  });

  it("does not take the header's login button for it", () => {
    const doc = loadFixture("infostud-job.html");
    doc.querySelector("[data-apply-button-container]")?.remove();

    expect(doc.body.textContent).toContain("Prijavite se");
    expect(infostud.findApplyControl(doc)).toBeNull();
  });

  it("finds the control by its words when the site's markup has changed", () => {
    const doc = documentFrom('<html><body><main><button>Konkurišite</button></main></body></html>');

    expect(infostud.findApplyControl(doc)?.tagName).toBe("BUTTON");
  });

  it("is a job page only on /posao/{slug}/{company}/{id}", () => {
    expect(infostud.isJobPage(new URL(JOB_URL))).toBe(true);
    for (const url of [
      "https://poslovi.infostud.com/",
      "https://poslovi.infostud.com/oglasi-za-posao",
      "https://poslovi.infostud.com/posao/accounting-officer",
      "https://poslovi.infostud.com/konkurs/765278",
    ]) {
      expect(infostud.isJobPage(new URL(url)), url).toBe(false);
    }
  });

  it("reads no job from a page that isn't a job's", () => {
    expect(infostud.readJob(loadFixture("infostud-job.html"), new URL("https://poslovi.infostud.com/oglasi-za-posao"))).toBeNull();
  });

  it("reads the new job after an in-page move, and nothing while the page still holds the old one", () => {
    const doc = loadFixture("infostud-job.html");
    const nextJob = new URL("https://poslovi.infostud.com/posao/cook/restaurant-doo/765999");

    // The address has changed, the head hasn't: the previous job's title must not go with the new address.
    expect(infostud.readJob(doc, nextJob)).toBeNull();

    // The head catches up with the address.
    const posting = [...doc.querySelectorAll('script[type="application/ld+json"]')].find((script) => script.textContent?.includes('"JobPosting"'));
    if (posting) {
      posting.textContent = JSON.stringify({
        "@type": "JobPosting",
        title: "Cook",
        url: "https://poslovi.infostud.com/posao/cook/restaurant-doo/765999",
        hiringOrganization: { name: "Restaurant d.o.o." },
      });
    }
    doc.querySelector("h1")!.textContent = "Cook";

    expect(infostud.readJob(doc, nextJob)).toEqual({
      url: "https://poslovi.infostud.com/posao/cook/restaurant-doo/765999",
      title: "Cook",
      company: "Restaurant d.o.o.",
      location: null,
    });
  });

  it("falls back to the page's heading, without the company's suffix, when there is no JSON-LD", () => {
    const doc = loadFixture("infostud-job.html");
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) script.remove();

    expect(infostud.readJob(doc, new URL(JOB_URL))).toEqual({ url: JOB_URL, title: "Accounting Officer", company: null, location: null });
  });

  it("finds no job when the page shows none", () => {
    expect(infostud.readJob(documentFrom("<html><body></body></html>"), new URL(JOB_URL))).toBeNull();
  });
});
