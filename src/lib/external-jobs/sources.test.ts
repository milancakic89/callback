import { describe, expect, it } from "vitest";
import {
  EXTERNAL_SOURCE_HOSTS,
  EXTERNAL_SOURCE_LABELS,
  EXTERNAL_SOURCES,
  externalSourceOf,
  externalSourceOfHost,
  isExternalSource,
  parseHttpsUrl,
} from "./sources";

describe("external sources", () => {
  it("names the three sites, each with a host and a label", () => {
    expect(EXTERNAL_SOURCES).toEqual(["linkedin", "helloworld", "infostud"]);
    expect(EXTERNAL_SOURCE_HOSTS).toEqual({
      linkedin: "www.linkedin.com",
      helloworld: "www.helloworld.rs",
      infostud: "poslovi.infostud.com",
    });
    expect(EXTERNAL_SOURCE_LABELS).toEqual({ linkedin: "LinkedIn", helloworld: "HelloWorld", infostud: "Infostud" });
  });

  it("knows a source from any other string", () => {
    expect(isExternalSource("linkedin")).toBe(true);
    for (const value of ["callback", "LinkedIn", "", null, undefined, 3]) expect(isExternalSource(value), String(value)).toBe(false);
  });
});

describe("externalSourceOfHost", () => {
  it("matches each site's own host, in any case", () => {
    expect(externalSourceOfHost("www.linkedin.com")).toBe("linkedin");
    expect(externalSourceOfHost("WWW.HelloWorld.rs")).toBe("helloworld");
    expect(externalSourceOfHost("poslovi.infostud.com")).toBe("infostud");
  });

  it("refuses look-alikes and the sites' other hosts", () => {
    for (const host of [
      "linkedin.com",
      "linkedin.com.evil.rs",
      "www.linkedin.com.evil.rs",
      "evil-www.linkedin.com",
      "evilwww.linkedin.com",
      "rs.linkedin.com",
      "helloworld.rs",
      "www.helloworld.rs.evil.com",
      "infostud.com",
      "poslovi.infostud.com.evil.com",
      "x.poslovi.infostud.com",
      "",
    ]) {
      expect(externalSourceOfHost(host), host).toBeNull();
    }
  });
});

describe("parseHttpsUrl", () => {
  it("parses an https address", () => {
    expect(parseHttpsUrl("https://www.linkedin.com/jobs/view/123/")?.hostname).toBe("www.linkedin.com");
  });

  it("refuses everything else", () => {
    for (const input of [
      "http://www.linkedin.com/jobs/view/123/",
      "javascript:alert(1)",
      "data:text/html,x",
      "ftp://www.linkedin.com/",
      "https://user:pass@www.linkedin.com/jobs/view/123/",
      "https://user@www.linkedin.com/jobs/view/123/",
      "https://www.linkedin.com:8443/jobs/view/123/",
      "//www.linkedin.com/jobs/view/123/",
      "/jobs/view/123/",
      "not a url",
      "",
    ]) {
      expect(parseHttpsUrl(input), input).toBeNull();
    }
  });
});

describe("externalSourceOf", () => {
  it("derives the source from the host of the address", () => {
    expect(externalSourceOf("https://www.linkedin.com/jobs/view/123/")).toBe("linkedin");
    expect(externalSourceOf("https://www.helloworld.rs/posao/a/b/1")).toBe("helloworld");
    expect(externalSourceOf("https://poslovi.infostud.com/posao/a/b/1")).toBe("infostud");
  });

  it("is null for another host, a downgraded scheme or credentials", () => {
    expect(externalSourceOf("https://linkedin.com.evil.rs/jobs/view/123/")).toBeNull();
    expect(externalSourceOf("http://www.linkedin.com/jobs/view/123/")).toBeNull();
    expect(externalSourceOf("https://www.linkedin.com@evil.rs/jobs/view/123/")).toBeNull();
    expect(externalSourceOf("javascript:alert(1)")).toBeNull();
  });
});
