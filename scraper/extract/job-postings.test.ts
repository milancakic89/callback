import { describe, expect, it } from "vitest";
import { collectPostings, hiringOrganizationName, jobPostingsFromScripts, postingPlace } from "./job-postings";

const posting = (fields: Record<string, unknown> = {}) => ({ "@type": "JobPosting", title: "Engineer", ...fields });

describe("collectPostings", () => {
  it("finds a posting, a list of them, and the ones inside @graph and list items", () => {
    const found: Record<string, unknown>[] = [];
    collectPostings(
      [
        posting({ title: "one" }),
        { "@graph": [{ "@type": "WebSite" }, posting({ title: "two" })] },
        { itemListElement: [{ item: posting({ title: "three" }) }] },
        { "@type": ["Thing", "JobPosting"], title: "four" },
      ],
      found,
    );

    expect(found.map((record) => record.title)).toEqual(["one", "two", "three", "four"]);
  });

  it("ignores everything that isn't a posting", () => {
    const found: Record<string, unknown>[] = [];
    collectPostings([{ "@type": "Organization" }, "text", 3, null, [["nested"]]], found);

    expect(found).toEqual([]);
  });
});

describe("jobPostingsFromScripts", () => {
  it("reads the postings of every script, and skips one that isn't JSON", () => {
    const postings = jobPostingsFromScripts([
      JSON.stringify({ "@type": "WebSite" }),
      "{ not json",
      JSON.stringify(posting({ title: "kept" })),
      "",
    ]);

    expect(postings.map((record) => record.title)).toEqual(["kept"]);
  });
});

describe("hiringOrganizationName", () => {
  it("reads the name of an Organization, a plain name, and the first of a list", () => {
    expect(hiringOrganizationName(posting({ hiringOrganization: { "@type": "Organization", name: " Acme d.o.o. " } }))).toBe("Acme d.o.o.");
    expect(hiringOrganizationName(posting({ hiringOrganization: "Acme" }))).toBe("Acme");
    expect(hiringOrganizationName(posting({ hiringOrganization: [{ name: "" }, { name: "Second" }] }))).toBe("Second");
  });

  it("is null when there is none", () => {
    expect(hiringOrganizationName(posting())).toBeNull();
    expect(hiringOrganizationName(posting({ hiringOrganization: { name: "" } }))).toBeNull();
  });
});

describe("postingPlace", () => {
  it("joins locality, region and country, and takes a two-letter country as the code", () => {
    expect(
      postingPlace({ address: { addressLocality: "Belgrade", addressRegion: "Central Serbia", addressCountry: "RS" } }),
    ).toEqual({ text: "Belgrade, Central Serbia, RS", country: "rs" });
  });

  it("joins several places with a slash, once each", () => {
    expect(
      postingPlace([{ address: { addressLocality: "Belgrade" } }, { address: { addressLocality: "Novi Sad" } }, { address: { addressLocality: "Belgrade" } }]).text,
    ).toBe("Belgrade / Novi Sad");
  });

  it("takes a country that is an object with a name", () => {
    expect(postingPlace({ address: { addressLocality: "Vienna", addressCountry: { name: "Austria" } } })).toEqual({
      text: "Vienna, Austria",
      country: null,
    });
  });

  it("is empty with no place", () => {
    expect(postingPlace(undefined)).toEqual({ text: null, country: null });
    expect(postingPlace("Remote")).toEqual({ text: null, country: null });
  });

  it("skips a locality that is a list, as the scraper always did, unless asked to join it", () => {
    const infostud = { address: { addressLocality: ["Beograd"], addressRegion: "Srbija", addressCountry: "RS" } };

    expect(postingPlace(infostud).text).toBe("Srbija, RS");
    expect(postingPlace(infostud, { joinLocalityLists: true }).text).toBe("Beograd, Srbija, RS");
    expect(postingPlace({ address: { addressLocality: ["Beograd", "Zemun"] } }, { joinLocalityLists: true }).text).toBe("Beograd, Zemun");
  });
});
