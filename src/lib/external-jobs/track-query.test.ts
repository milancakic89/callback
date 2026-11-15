import { describe, expect, it } from "vitest";
import { canonicalJobUrl } from "./canonical-url";
import { buildTrackPath, LOCATION_MAX, TITLE_MAX, TRACK_PATH } from "./track-link";
import { INVALID_JOB_LINK_MESSAGE, jobUrlSchema, parseTrackQuery, trackNext } from "./track-query";

const LINKEDIN = "https://www.linkedin.com/jobs/view/4463907148/";
const HELLOWORLD = "https://www.helloworld.rs/posao/Fullstack-Developer/Proximus-d.o.o/766944";
const INFOSTUD = "https://poslovi.infostud.com/posao/accounting-officer/slvwz-doo/765278";

const query = (values: Record<string, string>) => new URLSearchParams(values);

describe("parseTrackQuery", () => {
  it("reads the job, with the source from the address's host", () => {
    expect(parseTrackQuery(query({ url: HELLOWORLD, title: "Fullstack Developer", company: "Proximus d.o.o.", location: "Belgrade" }))).toEqual({
      ok: true,
      value: { source: "helloworld", url: HELLOWORLD, title: "Fullstack Developer", company: "Proximus d.o.o.", location: "Belgrade" },
    });
  });

  it("takes the page's searchParams object as well", () => {
    expect(parseTrackQuery({ url: INFOSTUD, title: "Accounting Officer" })).toEqual({
      ok: true,
      value: { source: "infostud", url: INFOSTUD, title: "Accounting Officer", company: null, location: null },
    });
  });

  it("needs the address only: the rest is optional, and an empty one is null", () => {
    expect(parseTrackQuery(query({ url: LINKEDIN, title: "", company: "   " }))).toEqual({
      ok: true,
      value: { source: "linkedin", url: LINKEDIN, title: null, company: null, location: null },
    });
  });

  it("reduces the address to its canonical form", () => {
    const parsed = parseTrackQuery(query({ url: `${INFOSTUD}?esource=job#x` }));

    expect(parsed).toMatchObject({ ok: true, value: { url: INFOSTUD } });
  });

  it("ignores a source parameter: the host decides", () => {
    const parsed = parseTrackQuery(query({ url: HELLOWORLD, source: "linkedin" }));

    expect(parsed).toMatchObject({ ok: true, value: { source: "helloworld" } });
  });

  it("refuses a missing, foreign or malformed address", () => {
    for (const url of [
      undefined,
      "",
      "https://evil.rs/posao/a/b/1",
      "https://linkedin.com.evil.rs/jobs/view/4463907148/",
      "http://www.linkedin.com/jobs/view/4463907148/",
      "javascript:alert(1)",
      "https://user:pass@www.linkedin.com/jobs/view/4463907148/",
      "https://www.linkedin.com/feed/",
    ]) {
      expect(parseTrackQuery(url === undefined ? {} : { url }), String(url)).toEqual({ ok: false });
    }
  });

  it("refuses a parameter given twice", () => {
    expect(parseTrackQuery(new URLSearchParams(`url=${LINKEDIN}&url=${HELLOWORLD}`))).toEqual({ ok: false });
    expect(parseTrackQuery({ url: [LINKEDIN, HELLOWORLD] })).toEqual({ ok: false });
    expect(parseTrackQuery(new URLSearchParams(`url=${LINKEDIN}&title=a&title=b`))).toEqual({ ok: false });
  });

  it("cleans the text and cuts it to its length", () => {
    const parsed = parseTrackQuery(
      query({
        url: LINKEDIN,
        title: `  ${"t".repeat(TITLE_MAX + 20)}`,
        company: "Acme\n\u0000Corp",
        location: "l".repeat(LOCATION_MAX + 1),
      }),
    );

    expect(parsed.ok && parsed.value.title).toHaveLength(TITLE_MAX);
    expect(parsed.ok && parsed.value.company).toBe("Acme Corp");
    expect(parsed.ok && parsed.value.location).toHaveLength(LOCATION_MAX);
  });

  it("keeps markup as plain text", () => {
    const parsed = parseTrackQuery(query({ url: LINKEDIN, title: "<img src=x onerror=alert(1)>" }));

    expect(parsed.ok && parsed.value.title).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("jobUrlSchema", () => {
  it("gives the canonical job, or says the link is not one we can add", () => {
    expect(jobUrlSchema.safeParse(`${LINKEDIN}?x=1`)).toMatchObject({ success: true, data: { source: "linkedin", url: LINKEDIN } });

    const refused = jobUrlSchema.safeParse("https://evil.rs/");
    expect(refused.success).toBe(false);
    expect(!refused.success && refused.error.issues[0].message).toBe(INVALID_JOB_LINK_MESSAGE);
  });
});

describe("buildTrackPath and parseTrackQuery", () => {
  it("round-trip: what the extension builds is what the page reads", () => {
    const job = { url: INFOSTUD, title: "Računovođa / Accounting Officer", company: "SLVWZ d.o.o.", location: "Beograd, Srbija" };
    const path = buildTrackPath(job);
    const parsed = parseTrackQuery(new URLSearchParams(path.split("?")[1]));

    expect(parsed).toEqual({
      ok: true,
      value: { source: "infostud", url: INFOSTUD, title: job.title, company: job.company, location: job.location },
    });
  });

  it("round-trip with hostile text", () => {
    const title = `"><script>alert(1)</script>&url=https://evil.rs#`;
    const path = buildTrackPath({ url: LINKEDIN, title, company: "a=b&c=d" });
    const parsed = parseTrackQuery(new URLSearchParams(path.split("?")[1]));

    expect(parsed).toMatchObject({ ok: true, value: { url: LINKEDIN, title, company: "a=b&c=d" } });
  });
});

describe("trackNext", () => {
  it("accepts the link of this page", () => {
    const path = buildTrackPath({ url: LINKEDIN, title: "Engineer", company: "Acme" });

    expect(trackNext(path)).toBe(path);
  });

  it("accepts a link with the address only", () => {
    expect(trackNext(`${TRACK_PATH}?url=${encodeURIComponent(HELLOWORLD)}`)).toBe(buildTrackPath({ url: HELLOWORLD }));
  });

  it("gives the path rebuilt from what was parsed, in the same form each time", () => {
    const messy = `${TRACK_PATH}?company=Acme&url=${encodeURIComponent(`${INFOSTUD}?x=1`)}&title=%20Engineer%0A`;
    const rebuilt = trackNext(messy);

    expect(rebuilt).toBe(buildTrackPath({ url: INFOSTUD, title: "Engineer", company: "Acme" }));
    expect(trackNext(rebuilt)).toBe(rebuilt);
    expect(canonicalJobUrl(new URLSearchParams((rebuilt ?? "").split("?")[1]).get("url") ?? "")?.url).toBe(INFOSTUD);
  });

  it("refuses another path, even one that starts the same", () => {
    const url = encodeURIComponent(LINKEDIN);
    for (const next of [
      `/applications?url=${url}`,
      `/applications/new/?url=${url}`,
      `/applications/newer?url=${url}`,
      `/applications/new/extra?url=${url}`,
      `//applications/new?url=${url}`,
      `/\\applications/new?url=${url}`,
      `https://callback.rs${TRACK_PATH}?url=${url}`,
      `//evil.rs${TRACK_PATH}?url=${url}`,
      `${TRACK_PATH}`,
      `${TRACK_PATH}?`,
      "/dashboard",
      "/",
      "",
    ]) {
      expect(trackNext(next), next).toBeNull();
    }
  });

  it("refuses a parameter we don't know, a repeated one and a fragment", () => {
    const url = encodeURIComponent(LINKEDIN);
    for (const next of [
      `${TRACK_PATH}?url=${url}&next=//evil.rs`,
      `${TRACK_PATH}?url=${url}&utm_source=x`,
      `${TRACK_PATH}?url=${url}&source=linkedin`,
      `${TRACK_PATH}?url=${url}&url=${url}`,
      `${TRACK_PATH}?url=${url}&title=a&title=b`,
      `${TRACK_PATH}?url=${url}#top`,
    ]) {
      expect(trackNext(next), next).toBeNull();
    }
  });

  it("refuses an address that isn't a job of the three sites", () => {
    for (const address of ["https://evil.rs/posao/a/b/1", "http://www.linkedin.com/jobs/view/4463907148/", "javascript:alert(1)", ""]) {
      expect(trackNext(`${TRACK_PATH}?url=${encodeURIComponent(address)}`), address).toBeNull();
    }
  });

  it("refuses anything that isn't a string, and a huge one", () => {
    for (const next of [null, undefined, 42, {}, [], true]) expect(trackNext(next), String(next)).toBeNull();
    expect(trackNext(`${TRACK_PATH}?url=${encodeURIComponent(LINKEDIN)}&title=${"a".repeat(5000)}`)).toBeNull();
  });
});
