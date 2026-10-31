"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

// PDF.js for the review screen's viewer (features/applicant-review.md). It is loaded on first use,
// in the browser only, with its worker as a module worker the bundler emits next to the app, so
// nothing comes from another origin and the CSP stays as it is. WebAssembly is off: its image
// decoders would need 'wasm-unsafe-eval', and a CV rarely has images they are needed for.

// One worker for every document, passed to each explicitly: a document that made its own worker from
// the shared port would take it down for all the others when it is closed.
let pdfjs: Promise<{ lib: typeof import("pdfjs-dist"); worker: import("pdfjs-dist").PDFWorker }> | null = null;

function loadPdfjs() {
  pdfjs ??= import("pdfjs-dist")
    .then((lib) => {
      const port = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
      return { lib, worker: lib.PDFWorker.create({ port }) };
    })
    .catch((error: unknown) => {
      pdfjs = null;
      throw error;
    });
  return pdfjs;
}

// The document route's answer: 404 when the application or document isn't (or is no longer) there.
export class DocumentLoadError extends Error {
  constructor(readonly status: number) {
    super(`The document answered ${status}`);
  }
}

// Fetches through the document route (same origin, with the session cookie), so the browser never
// learns where the file is stored, and opens the bytes with PDF.js.
async function openPdf(url: string): Promise<PDFDocumentProxy> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new DocumentLoadError(response.status);
  const data = new Uint8Array(await response.arrayBuffer());
  const { lib, worker } = await loadPdfjs();
  return lib.getDocument({ data, worker, useWasm: false }).promise;
}

// Frees the document in the worker; the worker itself stays for the next one.
function destroy(document: Promise<PDFDocumentProxy>) {
  document.then((doc) => doc.loadingTask.destroy()).catch(() => {});
}

// The open documents, by URL. `open` answers the same promise for the same URL, so the viewer and
// the prefetch share one download. `keep` is called with the documents of the current applicant and
// of the ones Next or ← would open: those start loading now, and everything else is closed, so at
// most a handful are held at a time. A failed load is forgotten, so Retry fetches it again.
export function usePdfDocuments() {
  const documents = useRef(new Map<string, Promise<PDFDocumentProxy>>());

  const open = useCallback((url: string) => {
    const cache = documents.current;
    let document = cache.get(url);
    if (!document) {
      document = openPdf(url);
      cache.set(url, document);
      document.catch(() => {
        if (cache.get(url) === document) cache.delete(url);
      });
    }
    return document;
  }, []);

  const keep = useCallback(
    (urls: string[]) => {
      const cache = documents.current;
      for (const [url, document] of cache) {
        if (!urls.includes(url)) {
          cache.delete(url);
          destroy(document);
        }
      }
      for (const url of urls) open(url);
    },
    [open],
  );

  useEffect(() => {
    const cache = documents.current;
    return () => {
      for (const document of cache.values()) destroy(document);
      cache.clear();
    };
  }, []);

  return { open, keep };
}
