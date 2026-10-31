import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SAMPLE_CANDIDATES } from "@/components/landing/sample-documents";
import { demoDocumentFile, type DocumentKind } from "@/lib/review/documents";
import { MOCK_CANDIDATES } from "./mock-candidates";

// The seed script makes one account per entry and the demo job gives each of them an application,
// so the list is exactly the three the landing page shows, and an email that repeated or left
// example.com would make the seed touch (or create) a real address.
describe("the mock candidates", () => {
  it("are exactly three", () => {
    expect(MOCK_CANDIDATES).toHaveLength(3);
  });

  it("have unique keys and emails", () => {
    expect(new Set(MOCK_CANDIDATES.map((c) => c.key)).size).toBe(MOCK_CANDIDATES.length);
    expect(new Set(MOCK_CANDIDATES.map((c) => c.email)).size).toBe(MOCK_CANDIDATES.length);
  });

  it("all use the reserved example.com domain, in lower case, as Auth stores emails", () => {
    for (const candidate of MOCK_CANDIDATES) {
      expect(candidate.email, candidate.key).toMatch(/^[a-z.]+@example\.com$/);
    }
  });

  it("each have a CV and a letter in the landing demo", () => {
    for (const candidate of MOCK_CANDIDATES) {
      const sample = SAMPLE_CANDIDATES.find((s) => s.id === candidate.key);
      expect(sample, candidate.key).toBeDefined();
      expect(sample?.name).toBe(candidate.name);
      expect(sample?.cvFile).toBe(candidate.cvFile);
      expect(sample?.letterFile).toBe(candidate.letterFile);
      expect(typeof sample?.Cv, candidate.key).toBe("function");
      expect(typeof sample?.Letter, candidate.key).toBe("function");
    }
    expect(SAMPLE_CANDIDATES).toHaveLength(MOCK_CANDIDATES.length);
  });

  // The seed script uploads these, and public.demo_applicants() points the demo job's applications at
  // them: a CV for everyone, and a cover letter for all but Priya Raman.
  it("have their demo job's documents committed as PDFs", () => {
    expect(MOCK_CANDIDATES.filter((c) => !c.demoCoverLetter).map((c) => c.key)).toEqual(["priya-raman"]);

    for (const candidate of MOCK_CANDIDATES) {
      const kinds: DocumentKind[] = candidate.demoCoverLetter ? ["cv", "cover-letter"] : ["cv"];
      for (const kind of kinds) {
        const file = demoDocumentFile(candidate.key, kind);
        expect(existsSync(file), file).toBe(true);
        expect(readFileSync(file).subarray(0, 5).toString(), file).toBe("%PDF-");
      }
      if (!candidate.demoCoverLetter) {
        expect(existsSync(demoDocumentFile(candidate.key, "cover-letter")), candidate.key).toBe(false);
      }
    }
  });
});
