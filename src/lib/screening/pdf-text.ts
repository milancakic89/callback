import "server-only";

// The text of a PDF, read on the server with pdf.js, which is already a dependency (the review screen
// draws the same files with it, in the browser). Free and local: nothing is sent anywhere, and the
// text is used for the check and thrown away (features/cv-screening.md). It reads the text layer
// only: a scan has none and gives an empty string, and nothing here tries to recognise images.
//
// The legacy build is the one that runs in Node. In Node pdf.js runs its worker in the same process
// and finds it with `import("./pdf.worker.mjs")`, a file next to itself that a bundled server does not
// have; handing it the worker module as `globalThis.pdfjsWorker` is the documented alternative, and
// the static import below is what makes the bundler include it.

export type PdfTextOptions = {
  // Pages read, from the first. A CV is a page or two; the rest is ignored.
  maxPages?: number;
  timeoutMs?: number;
};

const DEFAULT_MAX_PAGES = 10;
const DEFAULT_TIMEOUT_MS = 5_000;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let loading: Promise<PdfJs> | undefined;

function loadPdfJs(): Promise<PdfJs> {
  loading ??= (async () => {
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  })().catch((error) => {
    // Try again next time rather than keeping a failed load for the life of the process.
    loading = undefined;
    throw error;
  });
  return loading;
}

// Throws on a file pdf.js can't open and on running out of time; the caller treats both as "couldn't
// read it". Items come with the spaces pdf.js decided on (letter-spaced headings come out as
// "P R O F I L E"), and a line ends where `hasEOL` says.
export async function extractPdfText(bytes: Uint8Array, options: PdfTextOptions = {}): Promise<string> {
  const { maxPages = DEFAULT_MAX_PAGES, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const pdfjs = await loadPdfJs();

  // pdf.js takes the memory of the array it is given, so it gets its own copy: the caller still
  // needs the bytes (to store them).
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), useWasm: false, verbosity: 0 });

  const read = async () => {
    const doc = await loadingTask.promise;
    const last = Math.min(doc.numPages, maxPages);
    let text = "";
    for (let pageNumber = 1; pageNumber <= last; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ("str" in item) text += item.hasEOL ? `${item.str}\n` : item.str;
      }
      text += "\n";
      page.cleanup();
    }
    return text;
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`PDF text extraction timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([read(), timeout]);
  } finally {
    clearTimeout(timer);
    // Frees the document, and stops reading one that timed out.
    await loadingTask.destroy().catch(() => {});
  }
}
