# Fix: CV upload failed on callback.rs, worked locally (R2 `411 MissingContentLength`)

**Status:** Fixed in code on the branch `fix/r2-upload-content-length`, 2026-11-10, and checked against the real bucket on a local production build. `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. Not committed, not pushed, **not deployed**: until it is, uploading a CV on callback.rs still fails.

## The symptom
Uploading a CV on `/profile` (and in the apply dialog) answered "Could not upload your CV. Try again." on callback.rs and worked when the app ran locally. The production environment was the same as `.env.local`, so the variables were not it.

## What was found
Run against callback.rs with a throwaway candidate (deleted afterwards, with its files), through the real page:
- a PDF of a few hundred bytes was uploaded and listed;
- PDFs of 1 and 3 MB reached the Server Action (HTTP 200 with `{"ok":false,"error":"Could not upload your CV. Try again."}`), so the request, the proxy and the body limit were fine; the action failed inside.

The same test on a **local production build** (`next build` and `next start`), where the server log can be read:
```
uploadCv put failed: Error: R2 put candidates/…/cvs/…/size-130kb.pdf failed: 411 MissingContentLength
```
Every size from 20 KB up failed the same way, 130 KB included (the size of the user's own CV).

## Why
`createDocumentStore().put()` (`src/lib/storage/r2.ts`) calls `aws4fetch`, which gives the global `fetch` a ready-made `Request`. In a Next.js **production** server `fetch` is patched, and the body of that `Request` reaches the network as a stream of unknown length, so it is sent chunked with no `Content-Length`. R2 refuses such a PUT with `411 MissingContentLength`. A few hundred bytes happen to go through. In `next dev` the path is different, which is why it worked locally.

## The fix
`put()` sends `Content-Length: <bytes.byteLength>` itself. `aws4fetch` leaves that header out of the signature, so signing is unchanged. Nothing else in the app writes to R2 except this call (`documentStore.put`, from the CV upload and the cover letter upload in `src/app/jobs/[jobId]/actions.ts`).

## Verification
- `src/lib/storage/r2.test.ts`: two new tests (the length is sent; it is not among the signed headers). The existing tests are untouched and pass.
- On a local production build against the real bucket, as a throwaway candidate: 20 KB, 130 KB, 1 MB and 3 MB PDFs are uploaded and listed, and the server log has no `uploadCv` error (before the fix every one of them logged `411 MissingContentLength`). The objects, the user and its counters were deleted afterwards.
- Not checked on callback.rs itself, since that needs the fix deployed.

## Why it wasn't caught
The tests stub `fetch`, which has no Next.js patch, and the candidate CV feature was only ever run with `next dev`. A production build, which is what callback.rs runs, was never driven through an upload. A new Server Action or upload path should be tried on `npm run build` and `npm start` before it is released.

## Order of release
No migration. Commit, then push to `main` (which deploys), only when asked. Afterwards upload a CV on callback.rs.
