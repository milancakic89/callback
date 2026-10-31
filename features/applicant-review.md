# Feature: Applicant Review (Fast Manual Mode)

**Status:** Implemented (2026-10-31). The migration is applied to Supabase (`applicant_review`, through `apply_migration`) and checked with SQL, and `npm run seed:mock-candidates` has uploaded the demo documents. The screen was driven in a headless Chromium (Playwright) as the test employer, against `next dev` and against a production build, and the screenshots were looked at. `npm test` (299 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. Committed, **not pushed**. See [Verification](#verification).

**Lets start** on a job's card opens `/{company}/jobs/{jobId}/review`: a dark screen where one person goes through the applicants of a job. On one screen it shows the playlist of applicants, the original CV, the cover letter (if there is one) and a small screening overview against the job's filters. **Next** marks the applicant viewed and opens the next one. The **heart** likes them. Nothing is rejected automatically.

It also starts the CV access model agreed for Callback: the files sit in a private bucket no client can read, every open goes through a route that checks access, there is no download button, and a withdrawn application can't be opened.

## Decisions (agreed with the user, 2026-10-31)
- **Real PDFs from the start.** PDF.js draws them on canvases. The files are in the private Supabase Storage bucket `application-documents`. The browser only ever sees `/api/applications/{id}/documents/{cv|cover-letter}`, never a Storage URL.
- **Demo data.**
  - The demo job's three applicants get their own PDFs, printed from the landing's sample documents (`src/components/landing/sample-documents.tsx`), so the landing demo and the review show the same files.
  - **Priya Raman's demo application has no cover letter**, so that case shows too.
  - The demo job gets filters, and each application gets the filters its CV meets, written by hand (Ana 4/4 required and 1/3 nice-to-have, Jonas 3/4 and 1/3, Priya 2/4 and 1/3).
  - Real matching comes last. Until then a real application's `matched_filters` is null and the overview says "Not checked yet".
- **Next.** It marks the open applicant viewed and opens the next one not viewed yet below them, wrapping round to the top. When everyone is viewed it shows "All candidates viewed", with "Show liked", "Start from the top" and "Back to dashboard". Clicking a row in the playlist only opens that applicant; it marks nothing.
- **The heart** (next to Next) likes or unlikes. Liked applicants carry a lime heart in the playlist, and **All / Liked** narrows the list.
- **The cover letter starts at 80%**, with "Hover to zoom" above it, so everything fits on one screen.
  - After about 250 ms of hovering (or on focus) it opens wide at reading size; moving away closes it after 150 ms.
  - **It opens over the CV, not over the overview** (a change from the plan). Opened over the overview it covered Next, and reaching Next meant crossing the letter, which opened it again.
- **Whole screen, no sidebar.** Four columns don't fit beside the sidebar. A thin top bar has the way back to the dashboard.
- **Colours: the landing's palette.**
  - The frame has `data-landing`, for the `--l-*` tokens of `landing.css`, and `dark`, for shadcn's dark tokens (which are that palette).
  - `<DarkSurface />` keeps `<html>` dark behind the screen.
  - The primary buttons are lime, as on the landing.
- **Withdrawn applications** are not in the playlist, and the document route answers 404 for them.

## The screen
- **From 1280px**, four columns: playlist (15rem) | CV | cover letter | overview (17rem).
  - The CV and the letter share the middle 1.4 : 1.
  - Each column scrolls on its own.
- **From 1024px**, the playlist moves into a left `Sheet`, opened from the "n/total" button in the top bar.
- **Below 1024px**, one view at a time (CV / Cover letter / Overview tabs), with the heart and Next in a bar at the bottom.
- **The top bar** has ← Dashboard, the job title, a Demo tag, and "x / n viewed". A lime line under it shows viewed of all.
- **Playlist rows** show initials, name, location, "New" (with a lime dot) or "✓ Viewed", the heart, and the required score ("3/4", lime when all are met). The open row has a lime bar. The list scrolls and keeps the open row in view.
- **The overview** shows:
  - the name, location and "Applied 26 Oct 2026";
  - a "Screening overview · Preview" section, with Required n/m as a segmented meter and ✓ / ✗ per filter, and the same for Nice-to-have (missing filters are greyed, not red);
  - the note "Nothing is rejected automatically. You decide who moves on.";
  - the heart and Next at the bottom, with the `→` `←` `L` keys.
- **Keys:** `→` Next, `←` the previous applicant (marks nothing), `L` heart, `Esc` closes the wide letter. Keys are ignored in inputs and while a dialog is open.
- **The URL keeps the open applicant** (`?candidate=<id>`, through `history.replaceState`), so a reload comes back to them.
- **Moving between applicants** slides the documents like the landing demo (`l-doc-next` / `l-doc-prev`, motion-safe). Every document starts at the top.
- **Marks are saved in the background.** Viewed and liked show at once, are saved through Server Actions, and are put back with a short note if saving fails.

## How it is built

### Database: `supabase/migrations/20261031120000_applicant_review.sql`
- **On `job_applications`:**
  - `cv_path` and `cover_letter_path`: object paths in the bucket, null when there is none. The mock ones are `mock/<sample_key>/<kind>.pdf`.
  - `matched_filters text[]`: null means not checked yet.
  - `viewed_at` and `liked_at`.
- **Policy "Companies can update applications to their jobs":** the company owns the job, and the application is not withdrawn. The update grant covers `viewed_at` and `liked_at` only.
- **Bucket `application-documents`:** private, PDF only, 5 MB a file. There are no policies on `storage.objects` for it, so only the secret key reads or writes it.
- **`public.demo_job_filters()` and `public.demo_applicants()`:** plain data (`immutable`, `search_path = ''`, execute revoked from `public`, `anon` and `authenticated`), used by `ensure_employer_workspace()` (`create or replace`, same signature) and by the backfill of the demo job that already existed.

### Demo documents
- `src/app/dev/documents/page.tsx` is development only (404 in a production build). It renders each demo document as one A4 sheet.
- `scripts/build-demo-documents.ts` (`npm run demo:documents`, with `next dev` running) prints each sheet with Playwright Chromium to `supabase/seed/documents/<key>-<kind>.pdf`. The files are committed: five PDFs with embedded fonts, one page each.
- `scripts/seed-mock-candidates.ts` uploads them (`upsert`) after the profiles. `MOCK_CANDIDATES[].demoCoverLetter` says which candidates have a letter, and must agree with `public.demo_applicants()`.

### Document route: `src/app/api/applications/[applicationId]/documents/[kind]/route.ts`
Each request goes through these steps in order:
1. **Parameters.** `kind` must be `cv` or `cover-letter`, and the id a uuid. Otherwise: 404.
2. **No browser viewer.** A request with a `Sec-Fetch-Dest` other than `empty` (a tab, an iframe, an `<object>` or `<embed>`) gets 404. The browser's own PDF viewer, with its download button, never opens a candidate's file. This discourages saving it but can't stop the developer tools.
3. **Session.** No session: 401. A candidate account: 404.
4. **Rate limit.** 240 a minute per user (`review-doc:<id>`, Postgres store).
5. **Access check.** The application is read with the caller's own client (`withdrawn_at is null`), so row level security decides whose it is. Only then is the file read with the secret key and answered `inline`, `Cache-Control: private, no-store`.

Rejected applications, closed jobs and the 60-day limit will be refused in the same place.

### Data and actions
- **`getJobApplicants(jobId)`** (`src/lib/companies/workspace.ts`) reads the active applications with their profiles, first come first, ties by name. It answers file names (the landing's names for mock candidates), never storage paths.
- **`markApplicationViewed(id)` and `setApplicationLiked(id, liked)`** (`src/app/(employer)/[company]/actions.ts`):
  - order of checks: uuid, then employer account, then rate limit (shared, 120 a minute), then the update;
  - no `refresh()`;
  - "Application not found." when row level security matches nothing.
- **Pure logic:**
  - `src/lib/review/navigation.ts`: `nextUnviewed`, `initialIndex`;
  - `src/lib/review/matches.ts`: `summarizeFilters`, case-insensitive;
  - `src/lib/review/documents.ts`: bucket, kinds, URLs, paths.

### Routes
- **The sidebar shell moved into a route group.** It is now `src/app/(employer)/[company]/(workspace)/layout.tsx`, with the dashboard, `jobs/new` and `jobs/[jobId]/edit` under it. `[company]/layout.tsx` keeps only `generateStaticParams`.
- **The review page** is `src/app/(employer)/[company]/(review)/jobs/[jobId]/review/page.tsx`, with its own dark full-screen layout. URLs did not change.

### Components (`src/components/review/`)
- `applicant-review.tsx`: state, keys, prefetch, layout, the wide cover letter, and the end state.
- `candidate-playlist.tsx`, `ats-panel.tsx`, `review-frame.tsx` (top bar, skeleton, empty state).
- `pdf.ts`: loads PDF.js on first use, with **one shared module worker** passed to every document. A document that makes its own worker from a shared port takes it down for all the others when it is closed.
  - `useWasm: false`, so the CSP needs no `'wasm-unsafe-eval'`. PDF.js 6 has no `eval`.
  - `usePdfDocuments()` holds the open documents by URL and loads ahead those of the applicants Next and ← would open. Everything else is closed (`loadingTask.destroy()`).
- `pdf-viewer.tsx`: draws each page at the sheet's width in device pixels, on an off-screen canvas copied over when complete, and draws it again after a resize settles. No text layer, no download.

## Verification

### Done
- **Checks.** `npm test` (299 tests, 38 new), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. In the production build `/dev/documents` answers 404 and the PDF.js worker is its own chunk.
- **Supabase, with SQL, after the migration and the seed:**
  - the five columns exist;
  - `authenticated` has `update` on `viewed_at` and `liked_at` only;
  - the select and update policies exist;
  - the bucket is private, `application/pdf`, 5 MB, with no storage policies;
  - the five objects are in place;
  - the demo job has its filters, and its three applications have their paths and matches (Priya without a letter);
  - the two data functions are not executable by `anon` or `authenticated`.
- **RLS as `authenticated` with the real owner's JWT**, in a `DO` block that ends with a deliberate exception (nothing kept, checked afterwards):
  - viewed and liked update 1 row, and unlike works;
  - `matched_filters`, `cv_path` and `withdrawn_at` are refused (insufficient privilege);
  - another employer updates and sees 0 rows;
  - a withdrawn application updates 0 rows;
  - `anon` is refused, and neither `anon` nor the owner sees any object in the bucket.
- **Security advisors:** nothing new. The same three "SECURITY DEFINER executable" warnings, `rate_limits` without policies, and leaked-password protection off.
- **Browser** (headless Chromium, signed in as the test employer through an admin magic link, against `next dev`, no console errors):
  - Lets start opens the review, and all three PDFs render;
  - hovering the letter opens it over the CV (928px wide at 1440) and moving away closes it;
  - heart then Next marks Ana viewed and draws Jonas in 89 ms, from the prefetch;
  - `→` opens Priya with "No cover letter with this application.";
  - `L` likes her, and Next on the last one shows "All candidates viewed";
  - after a reload all three are viewed, the URL still names Priya, and Liked shows Ana and Priya;
  - the playlist sheet at 1100px opens, and choosing a row closes it and opens that applicant;
  - no horizontal overflow at 1920, 1280, 1100 and 390.
- **The same open against a production build** (`next start`, the production CSP) renders the PDFs with no console errors.
- **The document route:**
  - opening it in a tab: 404;
  - the owner's `fetch`: 200, `application/pdf`, `private, no-store`;
  - Priya's cover letter, an unknown id and a bad kind: 404;
  - a request with no session: 401.
- The test's marks were cleared afterwards (`viewed_at` and `liked_at` null on the demo job).

### Not done
- Safari and Firefox, a real touch device, and a screen reader pass.
- A withdrawn application through the route, end to end in the browser. It is covered by the route test and the RLS check.
- Pushing to `main`, and the deploy that follows.

## Order of release (the database is shared between development and production)
1. The migration: done.
2. `npm run seed:mock-candidates`: done. `npm run demo:documents` is only needed when the sample documents change.
3. Push to `main`, which deploys. Only when asked.

## Out of scope
- Candidates uploading CVs, and the application form.
- Parsing and real matching (the ATS).
- Changing an application's status (reject, interview) and telling the candidate.
- A watermark in the viewer.
- The 60-day limit and closing a job.
- Viewed and liked counts on the job card.
- A text layer and search in the PDF.
- More than one reviewer per company.
