import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { extractPdfText } from "./pdf-text";

const demo = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), "supabase/seed/documents", name)));

// A one-page PDF with no text at all: what a scan looks like to a text reader (an empty page).
function emptyPagePdf(): Uint8Array {
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
  return new TextEncoder().encode(body);
}

describe("extractPdfText", () => {
  it("reads the text layer of a CV", async () => {
    const text = await extractPdfText(demo("ana-novak-cv.pdf"));

    expect(text).toContain("Ana Novak");
    expect(text).toContain("Senior Product Designer");
    expect(text).toMatch(/Figma/);
  });

  it("reads a cover letter too", async () => {
    const text = await extractPdfText(demo("jonas-weber-cover-letter.pdf"));
    expect(text).toContain("Jonas Weber");
    expect(text.length).toBeGreaterThan(300);
  });

  it("keeps words whole, so a phrase can be found in it", async () => {
    const text = await extractPdfText(demo("priya-raman-cv.pdf"));
    expect(text).toMatch(/priya raman/i);
    expect(text).not.toMatch(/P\s+R\s+I\s+Y\s+A/i);
  });

  it("leaves the bytes it was given usable", async () => {
    const bytes = demo("ana-novak-cv.pdf");
    const before = bytes.length;
    await extractPdfText(bytes);
    expect(bytes.length).toBe(before);
    expect((await extractPdfText(bytes)).length).toBeGreaterThan(100);
  });

  it("gives no text for a page without any", async () => {
    expect((await extractPdfText(emptyPagePdf())).trim()).toBe("");
  });

  it("throws on a file that only starts like a PDF", async () => {
    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.7 this is not really a pdf"))).rejects.toThrow();
  });

  it("reads at most the pages it is allowed", async () => {
    const all = await extractPdfText(demo("ana-novak-cv.pdf"), { maxPages: 10 });
    const none = await extractPdfText(demo("ana-novak-cv.pdf"), { maxPages: 0 });
    expect(all.length).toBeGreaterThan(none.trim().length);
    expect(none.trim()).toBe("");
  });

  it("stops waiting after the time it is given", async () => {
    await expect(extractPdfText(demo("ana-novak-cv.pdf"), { timeoutMs: 0 })).rejects.toThrow(/timed out/);
  });
});
