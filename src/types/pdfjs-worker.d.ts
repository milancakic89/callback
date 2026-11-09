// pdf.js ships types for its main module but not for its worker, which the screening hands to
// pdf.js as `globalThis.pdfjsWorker` (src/lib/screening/pdf-text.ts). Only its shape matters there.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
