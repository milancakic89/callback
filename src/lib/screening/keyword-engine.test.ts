import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toScreeningColumns } from "./engine";
import { keywordEngine } from "./keyword-engine";

const demo = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), "supabase/seed/documents", name)));

// The demo job's filters (public.demo_job_filters() in supabase/migrations/20261031120000_applicant_review.sql).
const DEMO_FILTERS = {
  required: ["Figma", "Design systems", "5+ years experience", "English"],
  optional: ["Accessibility", "Prototyping in code", "Mentoring"],
};

describe("the keyword engine on the demo CVs", () => {
  it("has an id to store with each result", () => {
    expect(keywordEngine.id).toBe("keywords-v1");
  });

  it("checks each filter by the words in the CV, and leaves a quantity to the reviewer", async () => {
    const outcome = await keywordEngine.screen({ bytes: demo("ana-novak-cv.pdf"), fileName: "ana-novak-cv.pdf" }, DEMO_FILTERS);

    expect(outcome.kind).toBe("checked");
    if (outcome.kind !== "checked") return;
    // The hand-written matches of the demo are semantic ("seven years" for "5+ years"); words alone
    // can't say that, so it is "unverified" here, not "missing".
    expect(outcome.verdicts["5+ years experience"]).toBe("unverified");
    expect(outcome.verdicts["Figma"]).toBe("met");
    expect(outcome.verdicts["Design systems"]).toBe("met");
    expect(Object.keys(outcome.verdicts).sort()).toEqual([...DEMO_FILTERS.required, ...DEMO_FILTERS.optional].sort());
  });

  it("gives every filter a verdict for each of the three demo CVs", async () => {
    for (const file of ["ana-novak-cv.pdf", "jonas-weber-cv.pdf", "priya-raman-cv.pdf"]) {
      const outcome = await keywordEngine.screen({ bytes: demo(file), fileName: file }, DEMO_FILTERS);
      expect(outcome.kind, file).toBe("checked");
      if (outcome.kind !== "checked") continue;
      expect(Object.values(outcome.verdicts), file).toHaveLength(7);
      for (const verdict of Object.values(outcome.verdicts)) expect(["met", "missing", "unverified"]).toContain(verdict);
    }
  });

  it("agrees with the demo job's hand-written matches wherever the words are in the CV", async () => {
    // The demo job's matches (public.demo_applicants()) were written by reading the CVs. By words:
    // - 5+ years is a quantity, so "unverified" for all three (the hand-written ones say met);
    // - Jonas's and Priya's CVs have "Design systems" as a meaning (a component library, a shared
    //   kit), not those words, so a keyword check says missing where the hand-written ones say met.
    const verdictsOf = async (file: string) => {
      const outcome = await keywordEngine.screen({ bytes: demo(file), fileName: file }, DEMO_FILTERS);
      return outcome.kind === "checked" ? outcome.verdicts : null;
    };
    expect(await verdictsOf("ana-novak-cv.pdf")).toEqual({
      Figma: "met",
      "Design systems": "met",
      "5+ years experience": "unverified",
      English: "met",
      Accessibility: "missing",
      "Prototyping in code": "missing",
      Mentoring: "met",
    });
    expect(await verdictsOf("jonas-weber-cv.pdf")).toEqual({
      Figma: "missing",
      "Design systems": "missing",
      "5+ years experience": "unverified",
      English: "met",
      Accessibility: "met",
      "Prototyping in code": "missing",
      Mentoring: "missing",
    });
    expect(await verdictsOf("priya-raman-cv.pdf")).toEqual({
      Figma: "missing",
      "Design systems": "missing",
      "5+ years experience": "unverified",
      English: "missing",
      Accessibility: "missing",
      "Prototyping in code": "met",
      Mentoring: "missing",
    });
  });

  it("tells a CV that has the words from one that hasn't", async () => {
    const cv = { bytes: demo("ana-novak-cv.pdf"), fileName: "ana-novak-cv.pdf" };
    const outcome = await keywordEngine.screen(cv, { required: ["Figma", "Kubernetes", "Rust"], optional: [] });
    expect(outcome).toEqual({ kind: "checked", verdicts: { Figma: "met", Kubernetes: "missing", Rust: "missing" } });
  });

  it("says unreadable for a file that only starts like a PDF", async () => {
    const broken = new TextEncoder().encode("%PDF-1.7 not really a pdf");
    expect(await keywordEngine.screen({ bytes: broken, fileName: "broken.pdf" }, DEMO_FILTERS)).toEqual({ kind: "unreadable" });
  });

  it("says unreadable for a PDF with no text layer, such as a scan, and does not call every filter missing", async () => {
    // A page with nothing on it: what a text reader sees of a scanned CV.
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>",
    ];
    let body = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((object, i) => {
      offsets.push(body.length);
      body += `${i + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = body.length;
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    const outcome = await keywordEngine.screen({ bytes: new TextEncoder().encode(body), fileName: "scan.pdf" }, DEMO_FILTERS);
    expect(outcome).toEqual({ kind: "unreadable" });
  });
});

describe("toScreeningColumns", () => {
  const now = new Date("2026-11-09T10:00:00.000Z");
  const filters = { required: ["Figma", "English", "5+ years"], optional: ["Mentoring"] };

  it("stores the met and the unverified labels, in the job's order", () => {
    const columns = toScreeningColumns(
      { kind: "checked", verdicts: { Mentoring: "met", English: "met", Figma: "missing", "5+ years": "unverified" } },
      "keywords-v1",
      filters,
      now,
    );
    expect(columns).toEqual({
      matched_filters: ["English", "Mentoring"],
      unverified_filters: ["5+ years"],
      screening_outcome: "checked",
      screened_at: "2026-11-09T10:00:00.000Z",
      screening_engine: "keywords-v1",
    });
  });

  it("stores nothing met for an unreadable CV, and says so", () => {
    expect(toScreeningColumns({ kind: "unreadable" }, "keywords-v1", filters, now)).toEqual({
      matched_filters: null,
      unverified_filters: null,
      screening_outcome: "unreadable",
      screened_at: "2026-11-09T10:00:00.000Z",
      screening_engine: "keywords-v1",
    });
  });

  it("stores an empty list, not null, when a checked CV meets nothing", () => {
    const columns = toScreeningColumns({ kind: "checked", verdicts: { Figma: "missing" } }, "keywords-v1", { required: ["Figma"], optional: [] }, now);
    expect(columns.matched_filters).toEqual([]);
    expect(columns.unverified_filters).toEqual([]);
  });
});
