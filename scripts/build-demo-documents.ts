import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { MOCK_CANDIDATES } from "../src/lib/candidates/mock-candidates";
import { demoDocumentFile, type DocumentKind } from "../src/lib/review/documents";

// Prints the demo job's documents to PDF (features/applicant-review.md): each sheet of the dev-only
// page src/app/dev/documents/page.tsx becomes one A4 file in supabase/seed/documents/, which is
// committed and uploaded by `npm run seed:mock-candidates`. Run with `npm run demo:documents` while
// `next dev` is running (BASE_URL, default http://localhost:3000). Only needed when the sample
// documents change.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const response = await page.goto(`${BASE_URL}/dev/documents`, { waitUntil: "networkidle" });
    if (!response?.ok()) throw new Error(`/dev/documents answered ${response?.status()}: is \`next dev\` running?`);
    await page.emulateMedia({ media: "screen" });
    // `next dev` overlays its indicator (a <nextjs-portal>) on every page; it must not be printed.
    await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((element) => element.remove()));

    const documents = MOCK_CANDIDATES.flatMap((candidate) => [
      { key: candidate.key, kind: "cv" as DocumentKind },
      ...(candidate.demoCoverLetter ? [{ key: candidate.key, kind: "cover-letter" as DocumentKind }] : []),
    ]);

    for (const { key, kind } of documents) {
      const id = `${key}/${kind}`;
      // One sheet on the page at a time, and its file name as the PDF's title.
      const found = await page.evaluate((id) => {
        let match: HTMLElement | null = null;
        for (const section of document.querySelectorAll<HTMLElement>("[data-document]")) {
          const isMatch = section.dataset.document === id;
          section.style.display = isMatch ? "" : "none";
          if (isMatch) match = section;
        }
        if (match) document.title = (match as HTMLElement).dataset.title ?? id;
        return match !== null;
      }, id);
      if (!found) throw new Error(`No sheet for ${id} on /dev/documents`);

      const file = path.join(process.cwd(), demoDocumentFile(key, kind));
      await mkdir(path.dirname(file), { recursive: true });
      await page.pdf({
        path: file,
        format: "A4",
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
      console.log(`wrote ${path.relative(process.cwd(), file)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
