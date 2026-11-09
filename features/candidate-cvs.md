# Feature: CVs on the Candidate's Account

**Status:** Implemented in code, and **the migration is applied** (2026-11-09, through `apply_migration`, together with [cv-screening.md](./cv-screening.md)'s). `npm test` (564 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. **Not checked yet:** the SQL checks as real users (three rolled-back `DO` blocks were declined) and the browser run, both below in [Verification](#verification). Nothing is committed or pushed.

**Scope when asked to implement "the plan":** only this document. It replaces the upload form of [apply-with-cv.md](./apply-with-cv.md). It needs [cv-screening.md](./cv-screening.md)'s migration applied first, and uses the R2 store of [document-storage.md](./document-storage.md).

## Why
Today `applyToJob` (`src/app/jobs/[jobId]/actions.ts`) takes a CV and a cover letter as PDFs from the computer and stores them per application in R2 (`applications/{applicationId}/{kind}/…`). The company's applications then hold the candidate's files. That makes the company the keeper of personal data it doesn't own.

The new model puts the data on the candidate's side:
- **CVs belong to the candidate's account.** They hold up to 5 and add or delete them themselves.
- **An application only points to one of those CVs.** The company can read it only while the application is active.
- **A CV on an active application can't be deleted.** The candidate is told which job it is active on.
- **A guest who clicks Apply signs in first** (or signs up), and comes back to the posting.
- **On the posting, the candidate applies in a modal.** They pick a CV from their account or upload one to their account (not to the application). A cover letter is optional, either typed or uploaded as a PDF.

No real candidate has applied yet (`apply-with-cv` is not released), so the model can change without migrating real files.

## Decisions (agreed with the user, 2026-11-09)
- **"Create a CV"** means uploading a PDF (5 MB at most) to the account, from the modal or from the new "Your CVs" page. There is no CV builder.
- **When the company unpublishes a job:**
  - **withdraw:** the company loses access, the CV is unlocked, and the cover letter is deleted;
  - **pause (keep):** the CV stays locked and the company keeps access;
  - **move:** access stays, on the new job.
- **Control stays with the candidate.** They can withdraw their own application at any time. The company then loses access, the CV is unlocked and the cover letter is deleted. This is also the way out of a pause that never ends.
- **Cover letter:** none, typed text, or a PDF. It belongs to the application, which is the candidate's, and is written for that one job. It lives as long as the application is active and is deleted when the application is withdrawn (by either side) or the job is deleted.
- **After sign-up, the guest also comes back to the posting,** through email confirmation, and the modal opens by itself.

## The rule everything follows
**An active application (`withdrawn_at is null`) holds documents. A withdrawn one holds none.**
- `job_applications.cv_id` references `candidate_cvs(id)` with the default `NO ACTION` (not `RESTRICT`, so deleting an account still cascades). While an application is active, the database refuses to delete its CV (`23503`).
- Withdrawing (by the company or the candidate) clears `cv_id`, `cv_path`, `cover_letter_path` and `cover_letter_text` in the same update. That unlocks the CV and ends the company's access.
- A check constraint enforces it: `withdrawn_at is null or (cv_id, cv_path, cover_letter_path, cover_letter_text are all null)`.
- `cv_path` stays as a copy of the CV's storage key. The document route, `rescreenJob()` and `fileName()` in `src/lib/companies/workspace.ts` work unchanged.

## Where the code differs from the plan
- **`withdrawn_by` is set exactly when `withdrawn_at` is** (a fourth check constraint, `job_applications_withdrawn_by_set`), so a withdrawal always says who did it.
- **The deletion trigger on `job_applications`** fires only on a delete or an update of `cv_path` / `cover_letter_path`, not on every mark the company sets. A key is queued only once no application points to it, which keeps the cover letter of an application the company had withdrawn and that takes over the documents in a move.
- **`my_cvs().active_on`** reads "Title at Company", which is what the delete message and the "Active on" line show.
- **The apply dialog stays mounted after sending.** The page refreshes with the application's date and the dialog says "Application sent" before it closes; the panel shows "You applied on …" with a link to `/applications`. Closing the dialog drops `?apply=1`, so a reload doesn't open it again.
- **`uploadCv` is called directly with the form's data** (not through `useActionState`) and returns the new CV, which the dialog selects. The browser refuses a file over 5 MB or not a PDF before uploading it, as before.
- **The screening reads the CV from R2 only when the job has filters.** A CV that can't be read from storage is the same as a screening that fails: the application is made, "Not checked yet".
- **The document route** checks the session first, then refuses a tab only for an employer: a candidate opens their own application's documents in a tab from `/applications`. A guest's tab now gets 401 instead of 404.
- **`/api/cvs/{id}`** sends the file name in `Content-Disposition` (it is cleaned on upload, so it can't break the quotes).
- **A sign-in to an account that has no type yet** also carries `next` into the pending-signup cookie, so that path comes back to the posting too.
- **`next.config.ts`:** `serverActions.bodySizeLimit` is `6mb`; `proxyClientMaxBodySize` is no longer set, since its default (10 MB) is above one file. Set to 6 MB it would cut a larger body short silently, instead of letting the action refuse it.
- **"Applied on Callback"** on `/applications` is shown only when there is something in it.

## Plan

### 1. Migration `supabase/migrations/20261109150000_candidate_cvs.sql`
- **`candidate_cvs`:**
  - columns: `id`, `user_id → auth.users on delete cascade`, `file_name` (the cleaned name), `storage_key unique`, `size_bytes` (check: up to 5 MB), `created_at`, and an index on `user_id`;
  - RLS on, `revoke all` from `anon` and `authenticated`. The server writes with the secret key, and candidates read through the RPC below. This keeps the rule that candidates never write to tables.
- **The limit of 5:** a `before insert` trigger takes `pg_advisory_xact_lock` on the user, counts their CVs, and raises `54000` at 5.
- **`job_applications` gets:**
  - `cv_id uuid references candidate_cvs(id)`, with an index;
  - `cover_letter_text text`, checked to 5,000 characters at most;
  - a check that an application doesn't have both a text and a PDF cover letter;
  - `withdrawn_by text check in ('company','candidate')`;
  - the "withdrawn holds no documents" check.
  - The backfill: existing withdrawn rows get `withdrawn_by = 'company'` and their documents cleared.
- **`storage_deletions (key text primary key, queued_at)`:** service role only. R2 can't be called from SQL, so this queue is how files get deleted.
  - Rows are added by `after update or delete` triggers on `job_applications` (old `cv_path` and `cover_letter_path` that start with `applications/`) and on `candidate_cvs` (old `storage_key`).
  - **Never `mock/…`** (the demo PDFs every company shares), and never a `candidates/…` path from `job_applications`: that file is the candidate's CV.
  - This also covers the cascade when a job or an account is deleted (triggers fire on cascades), and closes the gap where `deleteJobPosting` left files in R2.
- **`unpublish_job_posting`:** replaced, same signature.
  - `withdraw` sets `withdrawn_by='company'` and clears the documents.
  - `move`, for a candidate who already has an application on the target:
    - an **active** target stays as it is, and the source is dropped;
    - a target the **company** withdrew takes the source's documents, becomes active, and its screening is cleared (the existing re-check runs after a move);
    - a target the **candidate** withdrew is never reopened: the source is withdrawn instead.
- **Candidate RPCs** (`security definer`, `search_path=''`, `authenticated` only), in the pattern of `my_job_application`:
  - `my_cvs()`: id, file name, size, created_at, and `active_on text[]` ("Title · Company"). No storage keys.
  - `my_job_applications()`: id, job id, title, company, applied_at, a state (`active` / `paused` / `withdrawn` / `you_withdrew`), the CV's file name, and the cover letter (its kind, plus the text). None of the company's marks (liked, viewed, stage, screening).
  - `withdraw_my_application(p_application_id)`: only the caller's own active application. It sets `withdrawn_by='candidate'` and clears the documents.
  - `my_application_document_path(p_application_id, p_kind)`: lets a candidate open their own application's documents.

### 2. Storage helpers
- **`src/lib/review/documents.ts`:** add `candidateCvPath(userId, cvId, name)` → `candidates/{userId}/cvs/{cvId}/{cleanDocumentName}`. It reuses `cleanDocumentName()`, so Fast Manual Mode still shows the real file name.
- **New `src/lib/storage/deletions.ts`** (`server-only`): `drainStorageDeletions()`.
  - It reads up to 100 queued keys, calls `documentStore.delete` on each, and removes the rows that succeeded.
  - A failure stays queued and is retried on the next drain.
  - It runs in `after()` from every action that withdraws or deletes.
- **`src/lib/applications/apply-schema.ts`:** export the PDF file schema (`pdfFileSchema`) so CV uploads reuse it. The apply schema becomes `{ jobId, cvId, fullName, location, coverLetterText?, coverLetter? }`, with "not both" enforced.

### 3. Server Actions
- **New `src/app/(app)/profile/actions.ts`:**
  - **`uploadCv(formData)`:**
    1. zod, then `requireAccountType("candidate")`, then a rate limit (`cv-upload:{uid}`, 20 an hour);
    2. a friendly early check of under 5;
    3. the R2 `put`;
    4. the admin insert (a `54000` from the trigger becomes "You can keep up to 5 CVs. Delete one to add another."), with the R2 file deleted if the insert fails;
    5. `refresh()`.
    - It returns the new CV, so the modal can select it.
  - **`deleteCv(cvId)`:**
    1. the admin delete, by `id` and `user_id`;
    2. on `23503`, the answer "This CV is on an active application for {Title at Company}. You can delete it once the job closes or you withdraw the application." (the job names come from `my_cvs()`);
    3. `after(drainStorageDeletions)`, then `refresh()`.
- **`applyToJob`:** rewritten in the same order as today.
  1. Validate the form, check the candidate and the rate limit, check the job is open and not applied to.
  2. **The CV:** look it up by `cvId` and `user_id`. If it isn't there, answer "That CV is no longer on your account."
  3. Save the profile.
  4. **The cover letter:** upload the PDF, if there is one, to `applications/{id}/cover-letter/…`.
  5. **The screening:** read the CV's bytes from R2 with `documentStore.get(storage_key)`.
  6. **The insert:** `cv_id`, `cv_path = storage_key`, `cover_letter_path`, `cover_letter_text`, plus the screening result.
     - A `23503` (the CV was deleted in the meantime) gets the same message as step 2.
     - On any failure, the uploaded cover letter is removed.
  - Only one file now travels with a request, so `next.config.ts` can lower both 11 MB limits to `6mb`.
- **`src/app/(app)/applications/actions.ts`: add `withdrawMyApplication(id)`.** It calls the RPC with the user's own client, under a rate limit, then `after(drain)` and `refresh()`.
- **`src/app/(employer)/[company]/actions.ts`:** `unpublishJobPosting` (withdraw and move) and `deleteJobPosting` add `after(drainStorageDeletions)`.

### 4. Document routes
- **New `src/app/api/cvs/[cvId]/route.ts`:** the candidate opens their own CV (looked up by id and `user_id`) and it streams from R2. A tab is allowed, since it is the candidate's own file.
- **`src/app/api/applications/[applicationId]/documents/[kind]/route.ts`** gains a candidate branch through `my_application_document_path`. The employer branch stays exactly as it is: RLS plus `withdrawn_at is null`, which now also covers the candidate withdrawing.

### 5. Candidate UI
- **New page `/profile`, "Your CVs (n of 5)"** (`src/app/(app)/profile/page.tsx`):
  - each row has the file name, the date, and Open (a new tab);
  - Delete asks first in an `AlertDialog`. It is disabled with a lock icon and "Active on: {job}" while the CV is in use, and the server's message covers a race;
  - Upload is hidden at 5.
- **Wiring for `/profile`:**
  - `route-gate.ts`: add `/profile` to `CANDIDATE_PREFIXES`;
  - `company.ts`: move `"profile"` from the extra reserved words into `APP_ROUTES`. The reserved set stays the same, so no slug migration is needed;
  - `sidebar-nav.tsx`: add `CANDIDATE_ITEMS` "CVs".
- **Posting page** (`src/app/jobs/[jobId]/page.tsx`, `ApplyPanel`):
  - **a candidate gets an "Apply" button** that opens the new `src/components/jobs/apply-dialog.tsx` (it replaces `apply-form.tsx` and keeps `AppliedNotice`). The dialog opens by itself on `?apply=1`.
    - **Step 1, choose a CV:** the account's CVs as radio cards (newest first), and "Upload a new CV" (`uploadCv`, the new one is selected). With no CVs, the upload is the whole step. With 5, a link to `/profile`. A note says the CV stays on the account and the company can read it while the application is active.
    - **Step 2, details and cover letter:** name and location (filled in from the profile), and the cover letter as None / Write (a textarea, up to 5,000) / Upload PDF. Then "Send application".
    - It reuses the existing manual-submit pattern, so chosen files survive a failed send.
  - **a guest:** "Sign in to apply" goes to `/sign-in?next=/jobs/{id}?apply=1`, and "Create an account" to `/sign-up?next=…`.
- **`src/components/ui/dialog.tsx`:** add the shadcn base-nova Dialog (Base UI). It doesn't exist yet.
- **`/applications`:** a new top section, "Applied on Callback", from `my_job_applications()`.
  - Each row shows the state badge (Active / Paused by the company / Withdrawn by the company / You withdrew), the CV used, and the cover letter (expand the text, or open the PDF).
  - "Withdraw" asks first: "The company loses access to your CV, your cover letter is deleted, and you can't apply to this job again."

### 6. Employer UI
- **`src/lib/companies/workspace.ts`:** `getJobApplicants` selects `cover_letter_text` and passes `coverLetterText` on.
- **`src/components/review/applicant-review.tsx`:** the cover letter frame shows the text (plain, `whitespace-pre-wrap`) when there is no PDF.
- **`src/components/employer/unpublish-job-button.tsx`:** the copy says withdrawing ends access to the CVs and deletes the cover letters, and that a pause keeps the CVs locked on the candidates' accounts.

### 7. Returning to the posting after sign-in or sign-up
- **`postingNext()`** (`src/lib/auth/safe-next.ts`) also accepts exactly `/jobs/<uuid>?apply=1`.
- **The sign-up form** carries `next` as a hidden field. `signUp` stores it (checked with `postingNext`) in the pending-signup cookie (`src/lib/auth/pending-signup.ts`).
- **`chooseAccountType`** hands it on to the activation email when the choice is candidate. The activation link in `src/lib/mail.ts` uses it instead of `homeFor()`, and `/auth/confirm` already redirects with `safeNext(next)`.
- **The links between sign-in and sign-up** keep `next`.

### 8. Tests (Vitest, next to the code, the mocks as in `actions.test.ts`)
- **`uploadCv`:** a file that isn't a PDF, one over 5 MB, the limit of 5 (both the early check and `54000`), and the R2 file deleted when the insert fails.
- **`deleteCv`:** `23503` gives the message with the job names, and the drain is scheduled.
- **`applyToJob`:** another candidate's CV or a missing one is refused; `23503` at insert; text or a PDF cover letter, never both; the screening reads the bytes from R2; the cover letter is removed on failure.
- **The rest:** `withdrawMyApplication`, `drainStorageDeletions` (keeps the rows that failed), `postingNext` with `?apply=1`, the route-gate and `APP_ROUTES` tests, the candidate branch of the document route, and the new `/api/cvs` route.

### 9. Documentation
- **This document,** updated as built.
- **Updates:** [apply-with-cv.md](./apply-with-cv.md) (the form is replaced), [job-publishing.md](./job-publishing.md) (unpublishing clears the documents), [applicant-review.md](./applicant-review.md) (text cover letter), [security.md](../project-overview/security.md), [architecture.md](../project-overview/architecture.md) (tables and storage), [roadmap.md](../project-overview/roadmap.md).

## Verification
**Done:** `npm test` (564 tests), `npm run lint`, `npx tsc --noEmit`, `npm run build`. The migration applied without an error.

**Still to do:** the SQL checks below (the rolled-back `DO` blocks were declined: once with throwaway users in `auth.users`, once with the existing accounts and only public tables), the browser run, and breaking the code on purpose.

**The checks to run:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, plus breaking the code on purpose a few times: the FK lock, the "withdrawn holds no documents" check, and the drain.
- **SQL as real users,** in a `DO` block that ends with a deliberate exception:
  - a 6th CV is refused;
  - a CV on an active application can't be deleted, and can be after either side withdraws;
  - withdrawing clears the documents and queues the cover letter;
  - the three `move` cases;
  - a `mock/` path is never queued;
  - a candidate can't read another candidate's CVs or applications.
- **Headless Chromium against `next dev`,** with throwaway `@example.com` accounts, deleted afterwards:
  1. a guest's Apply → sign-up → confirmation → back on the posting with the modal open;
  2. upload a CV in the modal and apply with a typed cover letter;
  3. the employer sees the CV and the text in Fast Manual Mode;
  4. deleting that CV is refused, with the job's name;
  5. the candidate withdraws: the employer gets 404, the CV can be deleted, and the R2 objects are gone.

## Order of release (the database is shared between development and production)
1. `20261109140000_cv_screening.sql`. Applied 2026-11-09.
2. `20261109150000_candidate_cvs.sql`. Applied 2026-11-09. The code on `main` keeps working with it: `unpublish_job_posting` has the same signature, and everything else is new columns, tables and functions.
3. Commit, then push to `main` (which deploys), only when asked.

## Out of scope
- A CV builder.
- Renaming CVs.
- Emailing candidates.
- The 60-day limit.
- Deleting an account from the UI.
- Re-applying after withdrawing (a withdrawn application still counts, as now).
- Deleting the old Supabase bucket.
