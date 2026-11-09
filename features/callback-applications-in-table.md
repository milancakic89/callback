# Feature: Callback Applications in the Applications Table

**Status:** Implemented on the branch `feature/callback-in-applications-table`, 2026-11-09, and checked in a browser against the real database. `npm test` (85 files, 868 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. No migration. Not committed, not pushed. See [Verification](#verification).

**Scope when asked to implement "the plan":** only this document. It changes what [candidate-cvs.md](./candidate-cvs.md) did for `/applications` ("Applied on Callback" as its own section), and builds on [candidate-steps.md](./candidate-steps.md), which gave a Callback application its automatic status.

## Context
`/applications` today has two lists. Above the table sits an "Applied on Callback" section for jobs companies posted here, with its own layout (the state, the CV, the cover letter, a Withdraw button). Below it is the table of the jobs the candidate tracks by hand. A job posted on Callback looks different from every other job there, and from how the job board shows it.

The candidate should see one list. A Callback application is a row of the same table as any other job, picked out the way the job board picks out a Callback job, and its status is automatic instead of a dropdown.

## Decisions (agreed with the user, 2026-11-09)
- **One table.** A Callback application is a row with the same columns as every other (Label, Company, Applied, Status), and sorts, pages and counts with the rest. The "Applied on Callback" section is gone.
- **Highlighted as on the job board:** the lime row (`NATIVE_ROW_CLASS`), a bold title and the dark "Auto-tracked" badge, whose tooltip already says "Posted on Callback. Your application status updates automatically." On a phone the row is a card with the lime ring, as on the board.
- **The title opens the job's own page** (`/jobs/{id}`) in the same tab, as on the job board.
- **The status is automatic:** the label the company applied, with the info icon and its text for a company's own step ([candidate-steps.md](./candidate-steps.md)), in place of the dropdown. The candidate can't change it.
- **Everything else is as for other jobs.** The row has nothing extra: no CV, cover letter or Withdraw button.
- **The CV, the cover letter and Withdraw move to the job's own page,** into the panel that says "You applied on …" (which gets a link to `/applications` as before).

## Decisions made while planning (not asked)
- **A Callback application whose job is not open any more** (the company paused it, withdrew the application, or the candidate did) is the table's gray "expired" row, with the state as an outline badge beside the title ("Paused by the company", "Withdrawn by the company", "You withdrew"), as an expired job has "Expired". Its status shows while the application is held (paused), and "—" once it is withdrawn.
- **Withdrawing must stay possible while the job is paused.** The posting page answers 404 for an unpublished job, which would leave a paused application with nowhere to withdraw from (the way out of a pause that never ends, [candidate-cvs.md](./candidate-cvs.md)). So `/jobs/{id}` also opens, for a candidate who has an application to that job, when the job isn't published: a short page with the job's title and company, a line that it is not open, and the same application panel. Anyone else still gets the not-found page.
- **Sorting by Status** gives every status a rank so the two kinds mix: Pending and Applied first, a company's step next, then Long time no answer, Rejected, Got offer, and last the applications that hold no status (withdrawn).
- **The row keys are unique across kinds:** a manual row is the scraped job's id, a Callback one is its application's id.
- **`getMyApplicationDate` is removed,** with its three tests: the posting page reads the whole application now (`my_job_applications()`), which has the date. The `my_job_application` database function stays, unused.

## The screens
- **`/applications`:** one table, "Showing 1–N of N" counting both kinds. Empty: "You haven't applied to any jobs yet." with Browse jobs. A Callback row:
  - **Label:** the title as a bold link to `/jobs/{id}`, then the "Auto-tracked" badge (and the state badge when the job isn't open any more);
  - **Company**, **Applied** (the date it was sent), as for other jobs;
  - **Status:** the status with its info icon, no dropdown.
- **`/jobs/{id}`, applied (active or paused):** the right-hand card shows "You applied on {date}"; the status (with the info icon); the state when it isn't active; the CV (opens in a tab) and the cover letter (a PDF opens in a tab, a typed one unfolds); **Withdraw** with its confirmation; and the link to Applications.
- **`/jobs/{id}`, withdrawn:** "The company withdrew your application." or "You withdrew your application. You can't apply to this job again." No documents, no Withdraw.
- **`/jobs/{id}` for a job that isn't published, to a candidate who applied:** a card with the job's title and company and "This job is not open for applications any more.", beside the same application card.

## Plan

### 1. Data and pure logic
- **`src/lib/applications/types.ts`:** `ApplicationListItem` becomes `ManualApplicationItem | CallbackApplicationItem`, told apart by `kind` (`"manual"` is today's shape; `"callback"` has the application's `id`, the posting's `jobId`, `title`, `companyName`, `appliedAt`, the `state` and the `status`, which is null once withdrawn).
- **New `src/lib/applications/list.ts`** (no `server-only`): `fromCallbackApplication()`, `mergeApplications()`, `itemKey()`, `isOpenItem()`, `statusRank()` and `compareApplications()` (moved out of the table component, where `compare` is today), with the `SortField` type.
- **`src/lib/applications/queries.ts`:** `getApplications()` sets `kind: "manual"`.
- **`src/lib/cvs/queries.ts`:** `getMyCallbackApplicationFor(jobId)`, the caller's application to one job or null, from `getMyCallbackApplications()`.
- **`src/lib/jobs/queries.ts`:** remove `getMyApplicationDate` and its tests.

### 2. The table
- **`src/components/jobs/auto-tracked-badge.tsx`:** `AutoTrackedBadge` moved out of `jobs-table.tsx` (unchanged), used by both tables.
- **New `src/components/applications/application-rows.tsx`:** `ManualApplicationRow` (today's row) and `CallbackApplicationRow`, so `applications-table.tsx` stays under 300 lines. `CallbackApplicationRow` uses `NATIVE_ROW_CLASS`, or `EXPIRED_ROW_CLASS` when the job isn't open, `AutoTrackedBadge`, and `CandidateStage` for the status.
- **`applications-table.tsx`:** sorts with `compareApplications()`, keys rows with `itemKey()`, renders a row by `kind`. The optimistic status state stays for manual rows only.
- **`src/app/(app)/applications/page.tsx`:** one Suspense boundary that reads both lists together and merges them. `callback-applications.tsx` and its test are removed.

### 3. The job's own page
- **New `src/components/applications/withdraw-button.tsx`:** `WithdrawButton` moved out of `callback-applications.tsx` (unchanged).
- **New `src/components/applications/my-application-panel.tsx`:** the panel above, from a `CallbackApplication`. No hooks; it holds the client `WithdrawButton`.
- **`src/components/jobs/apply-dialog.tsx`:** takes the application, and shows the panel where it shows `AppliedNotice` once applied. The "Application sent" dialog keeps its short notice (its text now says withdrawing is on this page).
- **`src/app/jobs/[jobId]/page.tsx`:** `ApplyPanel` reads `getMyCallbackApplicationFor()` in place of the date. A job that isn't published goes to a new `UnavailablePosting`, which reads the session (`connection()`), shows the short page and the panel for a candidate who applied, and is the not-found page for anyone else.

### 4. Tests (Vitest, `*.test.ts` next to the file, static markup for components)
- **New:** `list.ts` (merge, keys, open or not, ranks, comparing for each field), `auto-tracked-badge`, `application-rows`, `applications-table` (both kinds together, sorting, empty state, a withdrawn row), `withdraw-button`, `my-application-panel` (each state), `apply-dialog` (the applied branch), `getMyCallbackApplicationFor`.
- **Removed with the code they test:** `callback-applications.test.ts`, and the three `getMyApplicationDate` tests in `src/lib/jobs/queries.test.ts`. Every other existing test is untouched and must pass.

### 5. Documentation
- Update [candidate-cvs.md](./candidate-cvs.md) and [candidate-steps.md](./candidate-steps.md) where they describe the "Applied on Callback" section, `roadmap.md`, `architecture.md` and `testing.md`.

## Verification

### Done
- `npm test` (85 files, 868 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass.
- **Tests removed with the code they tested,** nothing else changed: `callback-applications.test.ts` (the section is gone) and the three `getMyApplicationDate` tests in `src/lib/jobs/queries.test.ts` (the function is gone). Every other existing test is untouched and passes.
- **New tests:** `list` (merging, keys, open or not, status ranks across kinds, comparing for each field), `auto-tracked-badge`, `application-rows`, `applications-table`, `withdraw-button`, `my-application-panel`, `apply-dialog` (the applied branch) and `getMyCallbackApplicationFor`.
- **Breaking the code on purpose** turned the suite red each time: a Callback row without the lime class (1 test), without the badge (2), a withdrawn application ranked first by status (2), every application counted as open (2), a paused application losing its documents and Withdraw (1), and the table drawing every row as a manual one (3). The originals were put back.
- **A throwaway employer, candidate and second candidate** (`@example.com`, made with the secret key, deleted afterwards with their counters and queued deletions; nothing is left), against the production build and the real database, in headless Chromium. 39 checks passed:
  - one table and no "Applied on Callback" section; "Showing 1–3 of 3" counts an open Callback application, a paused one and a job tracked by hand together;
  - the open Callback row has the lime class and tinted background, the Auto-tracked badge, a bold title linking to `/jobs/{id}`, its status ("Phone screen") with the info icon opening the company's text, and no dropdown; the manual row keeps its dropdown and isn't highlighted; the paused row is gray with "Paused by the company"; none of the CV or Withdraw is in the table;
  - sorting by each of the four columns keeps all rows;
  - the job's page for an open job shows "You applied on", the status with its info icon, the CV link to the document route, the typed cover letter as text and not HTML, and Withdraw;
  - **a paused job still opens for the candidate who applied** (title, company, "not open for applications any more", the panel with the CV and Withdraw); another candidate and a guest get the not-found page for it;
  - withdrawing from that page works: the database says the candidate withdrew and the documents are released; the panel then has no Withdraw; the table row says "You withdrew" with no status;
  - no horizontal overflow on `/applications` or on the job's page at 1920, 1280, 1100 and 390px; at 390 the Callback row is a card with the lime ring. The screenshots were looked at.
  - no console errors, apart from the `net::ERR_SSL_PROTOCOL_ERROR` that the production CSP's `upgrade-insecure-requests` causes when the production build is opened over plain `http://localhost`.

### Not done
- Safari and Firefox, a real touch device, and a screen reader pass.

## Order of release
No migration: it is all in the code. Commit, then push to `main` (which deploys), only when asked.

## Out of scope
- Withdrawing from the table row.
- Showing the application's CV or cover letter in the table.
- Dropping the `my_job_application` database function.
- A status history.
