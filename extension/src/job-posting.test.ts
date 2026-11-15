// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { detailsOf, jobPostingsOf, lookUpPosting, withoutCompanySuffix } from "./job-posting";
import { documentFrom, loadFixture } from "./test-support/fixtures";

const JOB_URL = "https://poslovi.infostud.com/posao/accounting-officer/slvwz-doo/765278";

const withScripts = (...scripts: unknown[]) =>
  documentFrom(`<html><head>${scripts.map((script) => `<script type="application/ld+json">${typeof script === "string" ? script : JSON.stringify(script)}</script>`).join("")}</head><body></body></html>`);

describe("jobPostingsOf", () => {
  it("reads the JobPosting of a page among its other JSON-LD", () => {
    const postings = jobPostingsOf(loadFixture("infostud-job.html"));

    expect(postings).toHaveLength(1);
    expect(postings[0].title).toBe("Accounting Officer - SLVWZ d.o.o.");
  });

  it("is empty for a page with none, and skips a script that isn't JSON", () => {
    expect(jobPostingsOf(documentFrom("<html><body></body></html>"))).toEqual([]);
    expect(jobPostingsOf(withScripts("{ nope", { "@type": "JobPosting", title: "Kept" }))).toHaveLength(1);
  });
});

describe("lookUpPosting", () => {
  it("finds the posting that is about the job in the address", () => {
    const lookup = lookUpPosting(loadFixture("infostud-job.html"), JOB_URL);

    expect(lookup.kind).toBe("found");
  });

  it("says the page is stale when it holds postings and none is about this job", () => {
    expect(lookUpPosting(loadFixture("infostud-job.html"), "https://poslovi.infostud.com/posao/a/b/1")).toEqual({ kind: "stale" });
  });

  it("says there is none when the page embeds none", () => {
    expect(lookUpPosting(documentFrom("<html><body></body></html>"), JOB_URL)).toEqual({ kind: "none" });
  });

  it("takes a posting that names no address, which can't be told apart", () => {
    expect(lookUpPosting(withScripts({ "@type": "JobPosting", title: "No url" }), JOB_URL).kind).toBe("found");
  });

  it("compares addresses in their canonical form", () => {
    const doc = withScripts({ "@type": "JobPosting", title: "Job", url: `${JOB_URL}?esource=job` });

    expect(lookUpPosting(doc, JOB_URL).kind).toBe("found");
  });
});

describe("withoutCompanySuffix", () => {
  it("drops ' - Company' from the end of a title, in any case", () => {
    expect(withoutCompanySuffix("Accounting Officer - SLVWZ d.o.o.", "SLVWZ d.o.o.")).toBe("Accounting Officer");
    expect(withoutCompanySuffix("Accounting Officer - slvwz d.o.o.", "SLVWZ D.O.O.")).toBe("Accounting Officer");
  });

  it("leaves a title that doesn't end with it, or is only that", () => {
    expect(withoutCompanySuffix("Accounting Officer", "SLVWZ d.o.o.")).toBe("Accounting Officer");
    expect(withoutCompanySuffix("Officer - Finance", "SLVWZ d.o.o.")).toBe("Officer - Finance");
    expect(withoutCompanySuffix(" - SLVWZ d.o.o.", "SLVWZ d.o.o.")).toBe(" - SLVWZ d.o.o.");
    expect(withoutCompanySuffix("Accounting Officer - SLVWZ d.o.o.", null)).toBe("Accounting Officer - SLVWZ d.o.o.");
  });
});

describe("detailsOf", () => {
  it("reads the title, the company and the place, with a locality written as a list", () => {
    const [posting] = jobPostingsOf(loadFixture("infostud-job.html"));

    expect(detailsOf(posting)).toEqual({ title: "Accounting Officer", company: "SLVWZ d.o.o.", location: "Beograd, Srbija, RS" });
  });

  it("is empty where the posting says nothing", () => {
    expect(detailsOf({ "@type": "JobPosting" })).toEqual({ title: null, company: null, location: null });
  });
});
