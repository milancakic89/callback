// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { documentFrom, loadFixture } from "../test-support/fixtures";
import { helloworld } from "./helloworld";

const JOB_URL = "https://www.helloworld.rs/posao/Fullstack-Developer/Proximus-d.o.o/766944";

describe("the HelloWorld adapter", () => {
  it("reads the job from its JSON-LD, with the address from the tab", () => {
    expect(helloworld.readJob(loadFixture("helloworld-job.html"), new URL(`${JOB_URL}?utm_source=x#top`))).toEqual({
      url: JOB_URL,
      title: "Fullstack Developer",
      company: "Proximus d.o.o.",
      location: null,
    });
  });

  it("finds the job's own apply control, a link to its application", () => {
    const control = helloworld.findApplyControl(loadFixture("helloworld-job.html"));

    expect(control?.getAttribute("href")).toBe("/konkurs/766944");
    expect(control?.classList.contains("apply-btn")).toBe(true);
  });

  it("does not take the header's login link for the apply control, though it says 'Prijavi se'", () => {
    const doc = loadFixture("helloworld-job.html");
    doc.querySelector("a.apply-btn")?.remove();

    expect(doc.body.textContent).toContain("Prijavi se");
    expect(helloworld.findApplyControl(doc)).toBeNull();
  });

  it("finds a control that says 'Prijavi se' by its words when the site's classes are gone, and still not the login link", () => {
    const doc = loadFixture("helloworld-job.html");
    const apply = doc.querySelector("a.apply-btn");
    apply?.removeAttribute("class");
    apply?.setAttribute("href", "https://www.helloworld.rs/posao/apply");
    if (apply) apply.textContent = " Prijavi se ";

    const control = helloworld.findApplyControl(doc);

    expect(control).toBe(apply);
    expect(control?.getAttribute("href")).not.toContain("/prijava");
  });

  it("is a job page only on /posao/{title}/{company}/{id}", () => {
    expect(helloworld.isJobPage(new URL(JOB_URL))).toBe(true);
    for (const url of [
      "https://www.helloworld.rs/",
      "https://www.helloworld.rs/poslovi",
      "https://www.helloworld.rs/posao/Fullstack-Developer",
      "https://www.helloworld.rs/prijava?redirect=%2Fposao%2Fx",
      "https://www.helloworld.rs/konkurs/766944",
    ]) {
      expect(helloworld.isJobPage(new URL(url)), url).toBe(false);
    }
  });

  it("reads no job from a page that isn't a job's, even with the same document", () => {
    const doc = loadFixture("helloworld-job.html");

    expect(helloworld.readJob(doc, new URL("https://www.helloworld.rs/poslovi"))).toBeNull();
    expect(helloworld.readJob(doc, new URL("https://www.linkedin.com/jobs/view/4463907148/"))).toBeNull();
  });

  it("ignores a JobPosting that is about another job: the page hasn't caught up with the address", () => {
    const doc = loadFixture("helloworld-job.html");
    const anotherJob = new URL("https://www.helloworld.rs/posao/Other-Job/Other-Company/111111");

    expect(helloworld.readJob(doc, anotherJob)).toBeNull();
  });

  it("falls back to the page's own heading when it has no JSON-LD", () => {
    const doc = loadFixture("helloworld-job.html");
    doc.querySelector('script[type="application/ld+json"]')?.remove();

    expect(helloworld.readJob(doc, new URL(JOB_URL))).toEqual({
      url: JOB_URL,
      title: "Fullstack Developer",
      company: "Proximus d.o.o.",
      location: null,
    });
  });

  it("finds no job when the page shows none", () => {
    expect(helloworld.readJob(documentFrom("<html><body><p>Loading</p></body></html>"), new URL(JOB_URL))).toBeNull();
  });

  it("keeps markup in the page's text as text", () => {
    const doc = loadFixture("helloworld-job.html");
    const script = doc.querySelector('script[type="application/ld+json"]');
    if (script) script.textContent = JSON.stringify({ "@type": "JobPosting", title: "<img src=x onerror=alert(1)>", hiringOrganization: { name: "<b>Acme</b>" } });

    expect(helloworld.readJob(doc, new URL(JOB_URL))).toMatchObject({ title: "<img src=x onerror=alert(1)>", company: "<b>Acme</b>" });
  });
});
