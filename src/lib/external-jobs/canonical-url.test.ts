import { describe, expect, it } from "vitest";
import { CANONICAL_URL_PATTERNS, canonicalJobUrl, JOB_URL_MAX } from "./canonical-url";

const LINKEDIN = "https://www.linkedin.com/jobs/view/4463907148/";
const HELLOWORLD = "https://www.helloworld.rs/posao/Fullstack-Developer/Proximus-d.o.o/766944";
const INFOSTUD = "https://poslovi.infostud.com/posao/accounting-officer/slvwz-doo/765278";

describe("canonicalJobUrl: LinkedIn", () => {
  it("keeps the job's own address as it is", () => {
    expect(canonicalJobUrl(LINKEDIN)).toEqual({ source: "linkedin", url: LINKEDIN });
  });

  it("adds the trailing slash, and drops the query and the hash", () => {
    for (const input of [
      "https://www.linkedin.com/jobs/view/4463907148",
      "https://www.linkedin.com/jobs/view/4463907148/?refId=abc&trackingId=def",
      "https://www.linkedin.com/jobs/view/4463907148/#top",
      "HTTPS://WWW.LINKEDIN.COM/jobs/view/4463907148/",
    ]) {
      expect(canonicalJobUrl(input), input).toEqual({ source: "linkedin", url: LINKEDIN });
    }
  });

  it("reads the id out of the slug form", () => {
    expect(canonicalJobUrl("https://www.linkedin.com/jobs/view/senior-software-engineer-at-jetbrains-4463907148")).toEqual({
      source: "linkedin",
      url: LINKEDIN,
    });
  });

  it("reads the id of the job open in a search or a list", () => {
    for (const input of [
      "https://www.linkedin.com/jobs/search/?currentJobId=4463907148&keywords=engineer",
      "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4463907148",
      "https://www.linkedin.com/jobs/search-results/?currentJobId=4463907148",
    ]) {
      expect(canonicalJobUrl(input), input).toEqual({ source: "linkedin", url: LINKEDIN });
    }
  });

  it("refuses a page that isn't a job", () => {
    for (const input of [
      "https://www.linkedin.com/jobs/",
      "https://www.linkedin.com/jobs/search/",
      "https://www.linkedin.com/jobs/search/?currentJobId=abc",
      "https://www.linkedin.com/jobs/search/?currentJobId=12",
      "https://www.linkedin.com/jobs/view/",
      "https://www.linkedin.com/jobs/view/abc/",
      "https://www.linkedin.com/jobs/view/123/",
      "https://www.linkedin.com/jobs/view/4463907148/extra",
      "https://www.linkedin.com/feed/?currentJobId=4463907148",
      "https://www.linkedin.com/in/someone/",
      "https://www.linkedin.com/",
    ]) {
      expect(canonicalJobUrl(input), input).toBeNull();
    }
  });
});

describe.each([
  ["HelloWorld", "helloworld", HELLOWORLD, "https://www.helloworld.rs/posao"],
  ["Infostud", "infostud", INFOSTUD, "https://poslovi.infostud.com/posao"],
] as const)("canonicalJobUrl: %s", (_name, source, canonical, base) => {
  it("keeps the job's own address as it is", () => {
    expect(canonicalJobUrl(canonical)).toEqual({ source, url: canonical });
  });

  it("drops the query, the hash and a trailing slash", () => {
    const [, path] = canonical.split("/posao/");
    for (const input of [`${canonical}?esource=job&emedium=app_main`, `${canonical}#apply`, `${canonical}/`, `${base}/${path}/?x=1#y`]) {
      expect(canonicalJobUrl(input), input).toEqual({ source, url: canonical });
    }
  });

  it("keeps a percent-encoded title and company", () => {
    expect(canonicalJobUrl(`${base}/Pomo%C4%87nik-u-ku%C4%87i/Firma-%C5%A1/1234`)).toEqual({
      source,
      url: `${base}/Pomo%C4%87nik-u-ku%C4%87i/Firma-%C5%A1/1234`,
    });
  });

  it("refuses a page that isn't a job", () => {
    for (const input of [
      `${base}/`,
      `${base}/title/company`,
      `${base}/title/company/abc`,
      `${base}/title/company/1/extra`,
      `${base}/title/1`,
      `${base}//company/1`,
      `${base}/title//1`,
      `${base}/title/company/1234567890123`,
      canonical.replace("/posao/", "/oglas/"),
      canonical.replace(/\/[0-9]+$/, "/"),
    ]) {
      expect(canonicalJobUrl(input), input).toBeNull();
    }
  });
});

describe("canonicalJobUrl: anything that isn't one of the three sites", () => {
  it("refuses http:, other schemes and credentials", () => {
    for (const input of [
      LINKEDIN.replace("https:", "http:"),
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "https://user:pass@www.linkedin.com/jobs/view/4463907148/",
      "https://www.linkedin.com@evil.rs/jobs/view/4463907148/",
      "https://www.linkedin.com:444/jobs/view/4463907148/",
      HELLOWORLD.replace("https://", "https://admin@"),
      INFOSTUD.replace("https://", "http://"),
    ]) {
      expect(canonicalJobUrl(input), input).toBeNull();
    }
  });

  it("refuses look-alike and other hosts", () => {
    for (const input of [
      "https://linkedin.com.evil.rs/jobs/view/4463907148/",
      "https://www.linkedin.com.evil.rs/jobs/view/4463907148/",
      "https://evil.rs/https://www.linkedin.com/jobs/view/4463907148/",
      "https://linkedin.com/jobs/view/4463907148/",
      "https://rs.linkedin.com/jobs/view/4463907148/",
      HELLOWORLD.replace("www.helloworld.rs", "helloworld.rs"),
      HELLOWORLD.replace("www.helloworld.rs", "www.helloworld.rs.evil.com"),
      INFOSTUD.replace("poslovi.infostud.com", "infostud.com"),
      INFOSTUD.replace("poslovi.infostud.com", "evil-poslovi.infostud.com"),
      "https://example.com/posao/a/b/1",
    ]) {
      expect(canonicalJobUrl(input), input).toBeNull();
    }
  });

  it("refuses what isn't an address, or is far too long", () => {
    for (const input of ["", "   ", "not a url", "/jobs/view/4463907148/", "//www.linkedin.com/jobs/view/4463907148/"]) {
      expect(canonicalJobUrl(input), input).toBeNull();
    }
    expect(canonicalJobUrl(`${HELLOWORLD}/${"a".repeat(3000)}`)).toBeNull();
    expect(canonicalJobUrl(`https://www.helloworld.rs/posao/${"a".repeat(JOB_URL_MAX)}/b/1`)).toBeNull();
  });

  it("refuses a value that isn't a string", () => {
    expect(canonicalJobUrl(undefined as unknown as string)).toBeNull();
    expect(canonicalJobUrl(42 as unknown as string)).toBeNull();
  });

  it("gives the same address for the same job however it was reached", () => {
    const once = canonicalJobUrl(`${INFOSTUD}?utm_source=x`);
    expect(once && canonicalJobUrl(once.url)).toEqual(once);
  });
});

describe("CANONICAL_URL_PATTERNS", () => {
  it("accept the canonical addresses and refuse everything else", () => {
    expect(new RegExp(CANONICAL_URL_PATTERNS.linkedin).test(LINKEDIN)).toBe(true);
    expect(new RegExp(CANONICAL_URL_PATTERNS.helloworld).test(HELLOWORLD)).toBe(true);
    expect(new RegExp(CANONICAL_URL_PATTERNS.infostud).test(INFOSTUD)).toBe(true);

    expect(new RegExp(CANONICAL_URL_PATTERNS.linkedin).test(`${LINKEDIN}?x=1`)).toBe(false);
    expect(new RegExp(CANONICAL_URL_PATTERNS.helloworld).test(`${HELLOWORLD}#x`)).toBe(false);
    expect(new RegExp(CANONICAL_URL_PATTERNS.infostud).test(INFOSTUD.replace("https://", "http://"))).toBe(false);
    expect(new RegExp(CANONICAL_URL_PATTERNS.infostud).test(HELLOWORLD)).toBe(false);
  });
});
