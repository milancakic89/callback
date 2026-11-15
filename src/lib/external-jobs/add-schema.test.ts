import { describe, expect, it } from "vitest";
import { addExternalApplicationSchema, COMPANY_REQUIRED_MESSAGE, TITLE_REQUIRED_MESSAGE } from "./add-schema";
import { INVALID_JOB_LINK_MESSAGE } from "./track-query";
import { COMPANY_MAX, LOCATION_MAX, TITLE_MAX } from "./track-link";

const CV_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";
const URL = "https://www.helloworld.rs/posao/Fullstack-Developer/Proximus-d.o.o/766944";

const fields = (overrides: Record<string, unknown> = {}) => ({
  url: URL,
  title: "Fullstack Developer",
  company: "Proximus d.o.o.",
  location: "Belgrade",
  cvId: CV_ID,
  status: "PENDING",
  ...overrides,
});

const messagesFor = (input: Record<string, unknown>, field: string): string[] | undefined => {
  const result = addExternalApplicationSchema.safeParse(input);
  return result.success ? undefined : result.error.issues.filter((issue) => issue.path[0] === field).map((issue) => issue.message);
};

describe("addExternalApplicationSchema", () => {
  it("reads a valid form, with the source from the address's host", () => {
    expect(addExternalApplicationSchema.parse(fields())).toEqual({
      url: { source: "helloworld", url: URL },
      title: "Fullstack Developer",
      company: "Proximus d.o.o.",
      location: "Belgrade",
      cvId: CV_ID,
      status: "PENDING",
    });
  });

  it("makes the address canonical, and ignores any source field", () => {
    const parsed = addExternalApplicationSchema.parse(fields({ url: `${URL}?utm=x#y`, source: "linkedin" }));

    expect(parsed.url).toEqual({ source: "helloworld", url: URL });
    expect(parsed).not.toHaveProperty("source");
  });

  it("takes no CV, and no location", () => {
    const parsed = addExternalApplicationSchema.parse(fields({ cvId: "", location: "   " }));

    expect(parsed).toMatchObject({ cvId: null, location: null });
    expect(addExternalApplicationSchema.parse({ ...fields(), cvId: undefined, location: undefined })).toMatchObject({ cvId: null, location: null });
  });

  it("cleans the text", () => {
    const parsed = addExternalApplicationSchema.parse(fields({ title: "  Senior\n Engineer\u0000 ", company: "Acme\t Corp" }));

    expect(parsed).toMatchObject({ title: "Senior Engineer", company: "Acme Corp" });
  });

  it("refuses an address that isn't a job of the three sites", () => {
    for (const url of ["https://evil.rs/posao/a/b/1", "http://www.helloworld.rs/posao/a/b/1", "javascript:alert(1)", ""]) {
      expect(messagesFor(fields({ url }), "url"), url).toEqual([INVALID_JOB_LINK_MESSAGE]);
    }
  });

  it("needs a title and a company", () => {
    expect(messagesFor(fields({ title: "  " }), "title")).toEqual([TITLE_REQUIRED_MESSAGE]);
    expect(messagesFor(fields({ company: "" }), "company")).toEqual([COMPANY_REQUIRED_MESSAGE]);
  });

  it("refuses text that is too long, rather than cutting it", () => {
    expect(messagesFor(fields({ title: "t".repeat(TITLE_MAX + 1) }), "title")?.[0]).toContain("at most 200");
    expect(messagesFor(fields({ company: "c".repeat(COMPANY_MAX + 1) }), "company")?.[0]).toContain("at most 200");
    expect(messagesFor(fields({ location: "l".repeat(LOCATION_MAX + 1) }), "location")?.[0]).toContain("at most 200");
    expect(addExternalApplicationSchema.safeParse(fields({ title: "t".repeat(TITLE_MAX) })).success).toBe(true);
  });

  it("refuses a CV that isn't an id and a status that isn't one of the four", () => {
    expect(addExternalApplicationSchema.safeParse(fields({ cvId: "not-an-id" })).success).toBe(false);
    for (const status of ["DONE", "pending", "", undefined]) {
      expect(addExternalApplicationSchema.safeParse(fields({ status })).success, String(status)).toBe(false);
    }
    for (const status of ["PENDING", "NO_ANSWER", "REJECTED", "OFFER"]) {
      expect(addExternalApplicationSchema.safeParse(fields({ status })).success, status).toBe(true);
    }
  });
});
