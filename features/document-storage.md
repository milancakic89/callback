# Feature: Application Documents in Cloudflare R2

**Status:** Implemented, and checked against the real bucket. The document route reads from R2, the seed script writes the demo PDFs there, and `src/lib/env.ts` requires the four variables. `npm test`, `npm run lint` and `npx tsc --noEmit` pass.

**Checked against R2** (from `.env.local`, with the same client the app uses): a signed `GET` of a missing key answers `null`; `put`, `get` and `delete` round-trip a key with a space, an accent and brackets; `npm run seed:mock-candidates` put the five demo PDFs at `mock/<key>/<kind>.pdf` and each came back byte for byte identical to the committed file.

**Not checked yet:** the document route in a browser (it needs an employer account, which needs the migration of [company-slugs.md](./company-slugs.md)), and the GitHub secret `PRODUCTION_ENV`, which only you can update (see Setup): until it has the four variables a deploy fails at `next build`, which is the safe way to fail.

CVs and cover letters are in Supabase Storage today (the private bucket `application-documents`, [applicant-review.md](./applicant-review.md)). Supabase's free plan gives 1 GB of storage and 5 GB of egress a month for the whole organization. Cloudflare R2's free tier gives 10 GB of storage, 1 million writes and 10 million reads a month, and never charges for egress. Before candidates start uploading ([apply-with-cv.md](./apply-with-cv.md)), the documents move to R2.

**Scope when asked to implement "the plan":** only this document. It comes after [company-slugs.md](./company-slugs.md) and before [apply-with-cv.md](./apply-with-cv.md).

## Decisions (agreed with the user, 2026-11-09)
- **R2 straight away,** rather than staying on Supabase Storage until it fills up.
- **The bucket is private, in the EU jurisdiction,** since CVs are personal data. A jurisdiction can't be changed after the bucket is made.
- **The browser still only ever talks to our server.**
  - Uploads go through a Server Action ([apply-with-cv.md](./apply-with-cv.md)), and reads through the existing document route.
  - So the CSP doesn't change, and the access model of [applicant-review.md](./applicant-review.md) stays exactly as it is: every open is checked, there is no download button, and nothing in the browser ever sees a storage address.

## Setup
Done by the user on 2026-11-09:
- **The bucket:** `callback-storage-document`, private, EU jurisdiction.
- **The key:** an Account API token with Object Read & Write on that bucket only.
- **`.env.local`:**
  - `R2_ENDPOINT`: the **EU** endpoint, `https://<account-id>.eu.r2.cloudflarestorage.com`. A bucket in a jurisdiction answers only on its own endpoint: the plain one gave `403 AccessDenied`;
  - `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- **Checked:** a signed, read-only `ListObjectsV2` answered 200 with an empty bucket.
- **Still to check:** the GitHub secret `PRODUCTION_ENV` needs the same four variables, with the EU endpoint. GitHub doesn't show a secret's value, so updating it means pasting the whole env file again.

## Plan

### 1. A storage module
- **The package `aws4fetch`:** a small S3 client with no dependencies, the one Cloudflare suggests for R2. It signs `fetch` requests, so the code stays plain.
- **New `src/lib/storage/r2.ts`:** `createDocumentStore({ endpoint, accessKeyId, secretAccessKey, bucket })`, with `put(key, bytes)`, `get(key)` (the body as a stream, or null for a missing object) and `delete(key)`. No `server-only`, since the seed script uses it too.
- **New `src/lib/storage/documents.ts`** (`server-only`): the same store, built from `env`.
- **`src/lib/env.ts` and `.env.example`:** the four variables, required. A release without them answers 500 on `/api/health`, and the deploy rolls back.

### 2. The document route
`src/app/api/applications/[applicationId]/documents/[kind]/route.ts` keeps every check in its order. Only the last step changes: it reads the file from R2 instead of `supabaseAdmin.storage`, and streams it.

### 3. The demo documents
`scripts/seed-mock-candidates.ts` uploads the committed demo PDFs to R2 at the same keys (`mock/<key>/<kind>.pdf`). `public.demo_applicants()` needs no change.

### 4. Tests
`route.test.ts` mocks the storage module instead of the Supabase one, with the same rules.

### 5. Documentation
This document; [applicant-review.md](./applicant-review.md), [architecture.md](../project-overview/architecture.md) (the storage table), [security.md](../project-overview/security.md), [deployment.md](../project-overview/deployment.md) (the four variables in `PRODUCTION_ENV`).

## Where the code differs from the plan
- **`put(key, bytes, contentType)`** takes the content type as an argument; the store has no opinion on it.
- **Over HTTPS the payload hash is `UNSIGNED-PAYLOAD`,** which is what aws4fetch sends for S3 and R2 accepts. The signed headers still cover the request.
- **Two retries, not ten.** aws4fetch retries a 5xx or 429 ten times with backoff by default; a person is waiting on each call, so the client is set to two.
- **A broken bucket is a 500, not a 404.** `get()` answers `null` only for a missing object (404). Any other failure throws, and the route answers 500 "Could not open the document", so an outage is not mistaken for a missing file. The route logs the error.
- **`DOCUMENTS_BUCKET` is gone** from `src/lib/review/documents.ts`; the bucket name comes from `R2_BUCKET`.
- **`src/lib/storage/r2.test.ts`** tests the client with a stubbed `fetch`: the signed request, the encoded key, `null` for a 404, errors with R2's code, the retries.

## Verification
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- `npm run seed:mock-candidates` puts the five demo PDFs in R2.
- **In a headless Chromium against `next dev`:**
  - the demo job's documents open from R2;
  - the route still refuses a tab, a guest and a candidate;
  - a throwaway account is used and deleted afterwards.

## Order of release
1. The four variables in `PRODUCTION_ENV`, with the EU endpoint.
2. `npm run seed:mock-candidates`, so the demo PDFs are in R2 before the code that reads them.
3. Commit, then push to `main` (which deploys), only when asked.

## Out of scope
- Deleting the old Supabase bucket. It stays, unused, until the user agrees to remove it.
- Uploading straight from the browser to R2 (signed URLs). It would need a CSP change and CORS on the bucket.
