import { describe, expect, it } from "vitest";
import { extractPostedAt, normalizePostedAt } from "./posted-at";

// A fixed "now", so "a date in the future" doesn't depend on the day the tests run.
const NOW = Date.parse("2026-10-27T12:00:00Z");

describe("normalizePostedAt", () => {
  it("reads the ISO forms sites and ATS APIs use", () => {
    expect(normalizePostedAt("2026-10-22", NOW)).toBe("2026-10-22T00:00:00.000Z");
    expect(normalizePostedAt("2026-10-22T09:30:00Z", NOW)).toBe("2026-10-22T09:30:00.000Z");
    expect(normalizePostedAt("2026-10-22T09:30:00.123Z", NOW)).toBe("2026-10-22T09:30:00.123Z");
    expect(normalizePostedAt("2026-10-22 09:30:00 UTC", NOW)).toBe("2026-10-22T09:30:00.000Z");
    expect(normalizePostedAt("2026-10-22T09:30", NOW)).toBe("2026-10-22T09:30:00.000Z");
  });

  it("applies an offset, with or without the colon", () => {
    expect(normalizePostedAt("2026-10-22T09:30:00+02:00", NOW)).toBe("2026-10-22T07:30:00.000Z");
    expect(normalizePostedAt("2026-10-22T09:30:00+0200", NOW)).toBe("2026-10-22T07:30:00.000Z");
    expect(normalizePostedAt("2026-10-22T09:30:00-04:00", NOW)).toBe("2026-10-22T13:30:00.000Z");
    expect(normalizePostedAt("2026-10-22T09:30:00+02", NOW)).toBe("2026-10-22T07:30:00.000Z");
  });

  it("reads no zone as UTC, wherever the machine is", () => {
    expect(normalizePostedAt("2026-10-22 09:30:00", NOW)).toBe("2026-10-22T09:30:00.000Z");
  });

  it("reads Java's Date.toString(), which SuccessFactors writes", () => {
    expect(normalizePostedAt("Thu Oct 01 02:00:00 UTC 2026", NOW)).toBe("2026-10-01T02:00:00.000Z");
  });

  it("refuses what it would have to guess", () => {
    // 1 October or 10 January? `Date.parse` says 10 January.
    expect(normalizePostedAt("01.10.2026", NOW)).toBeNull();
    expect(normalizePostedAt("10/01/2026", NOW)).toBeNull();
    // Read in whatever zone the machine happens to be in.
    expect(normalizePostedAt("Oct 1, 2026", NOW)).toBeNull();
    expect(normalizePostedAt("Posted 5 Days Ago", NOW)).toBeNull();
    expect(normalizePostedAt("yesterday", NOW)).toBeNull();
    expect(normalizePostedAt("", NOW)).toBeNull();
  });

  it("refuses a day that doesn't exist, which Date.parse would roll into the next month", () => {
    expect(Date.parse("2026-02-31T00:00:00Z")).not.toBeNaN();
    expect(normalizePostedAt("2026-02-31", NOW)).toBeNull();
    expect(normalizePostedAt("2026-13-01", NOW)).toBeNull();
    expect(normalizePostedAt("2026-10-22T25:00:00Z", NOW)).toBeNull();
    expect(normalizePostedAt("2024-02-29", NOW)).toBe("2024-02-29T00:00:00.000Z");
  });

  it("refuses a date before 2000 or more than a day ahead, which is a placeholder or a typo", () => {
    expect(normalizePostedAt("1970-01-01", NOW)).toBeNull();
    expect(normalizePostedAt("1999-12-31", NOW)).toBeNull();
    expect(normalizePostedAt("2026-10-29", NOW)).toBeNull();
    // Today, and a few hours ahead through a zone, are fine.
    expect(normalizePostedAt("2026-10-27", NOW)).toBe("2026-10-27T00:00:00.000Z");
    expect(normalizePostedAt("2026-10-28T08:00:00Z", NOW)).toBe("2026-10-28T08:00:00.000Z");
  });

  it("returns null for anything that isn't a string", () => {
    for (const value of [null, undefined, 20261022, {}, [], true]) {
      expect(normalizePostedAt(value, NOW)).toBeNull();
    }
  });
});

const page = (body: string) => `<!doctype html><html><head><title>Job</title></head><body>${body}</body></html>`;
const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

describe("extractPostedAt", () => {
  it("reads datePosted from the JobPosting JSON-LD a site publishes for Google for Jobs", () => {
    const html = page(jsonLd({ "@context": "https://schema.org", "@type": "JobPosting", title: "Dev", datePosted: "2026-10-20" }));
    expect(extractPostedAt(html, NOW)).toBe("2026-10-20T00:00:00.000Z");
  });

  it("finds the posting inside @graph, and among other kinds of JSON-LD", () => {
    const html = page(
      jsonLd({ "@type": "Organization", name: "Acme" }) +
        jsonLd({ "@graph": [{ "@type": "WebSite" }, { "@type": ["JobPosting"], datePosted: "2026-10-20T08:00:00Z" }] }),
    );
    expect(extractPostedAt(html, NOW)).toBe("2026-10-20T08:00:00.000Z");
  });

  it("reads itemprop=datePosted when there is no JSON-LD (SuccessFactors)", () => {
    const meta = page('<meta itemprop="datePosted" content="Thu Oct 01 02:00:00 UTC 2026">');
    expect(extractPostedAt(meta, NOW)).toBe("2026-10-01T02:00:00.000Z");
    const time = page('<time itemprop="datePosted" datetime="2026-10-02">2 Oct</time>');
    expect(extractPostedAt(time, NOW)).toBe("2026-10-02T00:00:00.000Z");
  });

  it("does not take a bare <time> tag: it could be a closing date or the page's own", () => {
    expect(extractPostedAt(page('<time datetime="2026-10-20">20 Oct</time> Apply before <time datetime="2026-11-30">30 Nov</time>'), NOW)).toBeNull();
  });

  it("counts a page with two different dates as none: it is probably a list, and which job is ours is unknown", () => {
    const html = page(
      jsonLd({ "@type": "JobPosting", title: "A", datePosted: "2026-10-01" }) +
        jsonLd({ "@type": "JobPosting", title: "B", datePosted: "2026-10-15" }),
    );
    expect(extractPostedAt(html, NOW)).toBeNull();
  });

  it("accepts several postings that agree on the date", () => {
    const html = page(
      jsonLd({ "@type": "JobPosting", datePosted: "2026-10-01" }) + jsonLd({ "@type": "JobPosting", datePosted: "2026-10-01" }),
    );
    expect(extractPostedAt(html, NOW)).toBe("2026-10-01T00:00:00.000Z");
  });

  it("prefers the JSON-LD date over microdata, which may spell the same day differently", () => {
    const html = page(
      jsonLd({ "@type": "JobPosting", datePosted: "2026-10-01T00:00:00Z" }) + '<meta itemprop="datePosted" content="2026-10-01">',
    );
    expect(extractPostedAt(html, NOW)).toBe("2026-10-01T00:00:00.000Z");
  });

  it("skips malformed JSON-LD, and a posting whose date can't be trusted", () => {
    expect(extractPostedAt(page('<script type="application/ld+json">{not json</script>'), NOW)).toBeNull();
    expect(extractPostedAt(page(jsonLd({ "@type": "JobPosting", datePosted: "01.10.2026" })), NOW)).toBeNull();
    expect(extractPostedAt(page(jsonLd({ "@type": "JobPosting", title: "No date" })), NOW)).toBeNull();
    expect(extractPostedAt(page("<p>Nothing here</p>"), NOW)).toBeNull();
  });
});
