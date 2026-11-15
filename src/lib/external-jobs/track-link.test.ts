import { describe, expect, it } from "vitest";
import { buildTrackPath, capText, cleanLinkText, COMPANY_MAX, LOCATION_MAX, TITLE_MAX, TRACK_PATH } from "./track-link";

const LINKEDIN = "https://www.linkedin.com/jobs/view/4463907148/";

describe("cleanLinkText", () => {
  it("turns control characters and runs of whitespace into one space, and trims", () => {
    expect(cleanLinkText("  Senior\n\tEngineer \u0000 (m/f)\u001f ")).toBe("Senior Engineer (m/f)");
  });

  it("drops zero-width and direction-changing marks", () => {
    expect(cleanLinkText("Acme​‮ Corp﻿")).toBe("Acme Corp");
  });

  it("keeps ordinary letters, accents and emoji", () => {
    expect(cleanLinkText("Pomoćnik u kući 🚀")).toBe("Pomoćnik u kući 🚀");
  });
});

describe("capText", () => {
  it("leaves a short text alone", () => {
    expect(capText("abc", 5)).toBe("abc");
  });

  it("cuts to the limit in characters, not in code units", () => {
    expect(capText("abcdef", 3)).toBe("abc");
    expect(capText("🚀🚀🚀🚀", 2)).toBe("🚀🚀");
  });
});

describe("buildTrackPath", () => {
  it("is the path of the page with the job in its query, the address first", () => {
    const path = buildTrackPath({ url: LINKEDIN, title: "Backend Engineer", company: "Acme", location: "Belgrade" });
    const [pathname, query] = path.split("?");

    expect(pathname).toBe(TRACK_PATH);
    expect([...new URLSearchParams(query).keys()]).toEqual(["url", "title", "company", "location"]);
    expect(new URLSearchParams(query).get("url")).toBe(LINKEDIN);
  });

  it("reduces the address to its canonical form", () => {
    const path = buildTrackPath({ url: "https://www.linkedin.com/jobs/search/?currentJobId=4463907148&keywords=x", title: "T" });

    expect(new URLSearchParams(path.split("?")[1]).get("url")).toBe(LINKEDIN);
  });

  it("leaves out what is missing or empty", () => {
    const query = new URLSearchParams(buildTrackPath({ url: LINKEDIN, title: "Engineer", company: null, location: "  " }).split("?")[1]);

    expect([...query.keys()]).toEqual(["url", "title"]);
  });

  it("encodes text as text: markup, quotes and ampersands can't end the value or start another", () => {
    const title = `<script>alert("x")</script> & company=evil&url=https://evil.rs`;
    const path = buildTrackPath({ url: LINKEDIN, title });
    const query = new URLSearchParams(path.split("?")[1]);

    expect(path).not.toContain("<script>");
    expect([...query.keys()]).toEqual(["url", "title"]);
    expect(query.get("title")).toBe(title);
  });

  it("cleans and caps every field", () => {
    const query = new URLSearchParams(
      buildTrackPath({
        url: LINKEDIN,
        title: `T\n${"t".repeat(TITLE_MAX + 50)}`,
        company: "c".repeat(COMPANY_MAX + 1),
        location: "l".repeat(LOCATION_MAX * 2),
      }).split("?")[1],
    );

    expect(query.get("title")).toHaveLength(TITLE_MAX);
    expect(query.get("title")?.startsWith("T t")).toBe(true);
    expect(query.get("company")).toHaveLength(COMPANY_MAX);
    expect(query.get("location")).toHaveLength(LOCATION_MAX);
  });

  it("throws for an address that is not a job of the three sites", () => {
    for (const url of ["https://example.com/posao/a/b/1", "http://www.linkedin.com/jobs/view/4463907148/", "javascript:alert(1)", ""]) {
      expect(() => buildTrackPath({ url, title: "x" }), url).toThrow();
    }
  });
});
