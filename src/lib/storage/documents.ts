import "server-only";
import { env } from "@/lib/env";
import { createDocumentStore } from "./r2";

// The private R2 bucket holding every application's CV and cover letter (features/document-storage.md).
// Nothing in the browser ever sees an address in it: files are read through the document route
// (src/app/api/applications/[applicationId]/documents/[kind]/route.ts) after its checks, and written
// by Server Actions.
export const documentStore = createDocumentStore({
  endpoint: env.R2_ENDPOINT,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  bucket: env.R2_BUCKET,
});
