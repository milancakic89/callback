# Feature: Application Status in Fast Manual Mode

**Superseded in part (2026-11-09) by [candidate-steps.md](./candidate-steps.md):** the fixed Screening, Interview and Hired are replaced by the company's own steps, the keys change, and the candidate is shown the status after "Apply statuses". The rest of this document describes what shipped on 2026-11-02.

**Status:** Implemented (2026-11-02). The migration is applied to Supabase (`application_stages`, through `apply_migration`, recorded there as version `20261102062200`, so it differs from the file name, as the earlier migrations do) and checked with SQL. The screen was driven in a headless Chromium against the real database. `npm test` (323 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. Pushed to `main` on 2026-11-02. See [Verification](#verification).

On the review screen ([applicant-review.md](./applicant-review.md)) an employer can now decide something about an applicant, not only view or like them. Each application has a status: **Applied, Screening, Interview, Offer, Hired** or **Rejected**. It is set with one click or one key, and the playlist shows it and can be narrowed by it. **The candidate is not told anything yet**: that is the next feature, email templates, which hangs off these statuses.

**Scope when asked to implement "the plan":** only this document. It builds on [applicant-review.md](./applicant-review.md), which is done.

## Why this comes first
- Until now a pass through the applicants ended with no decision: `viewed_at` and `liked_at` were all there was.
- Email templates are tied to a status ("the message your team set for that stage", as the landing says), so they have nothing to start from without one.
- It is the smallest of the remaining employer features, has no outside dependency, and can be tried on the demo job straight away.
- It changes the order in [roadmap.md](../project-overview/roadmap.md), which had the application form first. The form will have to show the candidate their status anyway, so the list of statuses comes first.

## The employer features, in order
This document covers only the first. The rest are one feature at a time, each with its own document.
1. **Application status in Fast Manual Mode** (this document).
2. **Email templates and sending them to the candidate:** a template per status, variables (candidate, job, company), a preview before sending, a record of what was sent, never sent to the mock accounts. Needs the company's name first (`companies.name` exists, nothing writes it). It also covers the "job closed" notice, which is not sent today.
3. **Candidates applying, and published jobs on `/jobs`:** the CV upload, and the status shown to the candidate. Only from here does the product work with real people. Items 2 and 3 can swap if real applications matter sooner.
4. **A job's candidates at a glance:** a table, counts per status on the job card, changing many at once. Worth it once a job has more than a handful of applicants.
5. **Real CV checks** against the job's filters. Written, as a free keyword check that reads the CV's text: [cv-screening.md](./cv-screening.md) (migration not applied yet).
6. **A job's own status and access to CVs:** closing a job, and the 60-day limit.
7. **Company profile:** a real slug, a logo, a careers page.
8. **Later:** team members, notes on a candidate, statistics, paid plans.

## Decisions (agreed with the user, 2026-11-02)
- **The statuses:** Applied → Screening → Interview → Offer → Hired, plus Rejected. Any status can change to any other, so a mistake is easy to put right.
- **The first status is "Applied", not "New".** The playlist already says "New" for an applicant not viewed yet, so "New" and "✓ Viewed" would sit on the same person. The landing's illustration of the pipeline changes that one word to match.
- **Keys:** `1` to `5` for the statuses in order, `R` for Rejected.
- **Choosing a status doesn't move on.** Next stays its own step, so a slip is seen before it is left behind.
- **A status counts as viewing the applicant once you move on from them,** by Next, ←, a row in the playlist or the end screen's choices. It isn't marked the moment the status is chosen: Next from the last new applicant has to end the pass ("All candidates viewed"), and it only knows to do that while they are still new. Leaving the page without moving on keeps the status but not the viewed mark.
- **Rejected doesn't end access to the CV in this step.** [applicant-review.md](./applicant-review.md) says rejected applications will be refused by the document route. That comes with the email feature, once the candidate has been told. Until then a rejection is a mark that can be taken back, so the employer can still read the CV.
- **Rejected applicants stay in the list:** dimmed in All, and Next goes through them on a second pass like anyone else. The status filter narrows the list when that isn't wanted.
- **`withdrawn_at` stays separate from the status.** Withdrawn applications are still not on this screen, and moving applicants to another job keeps their status.
- **The screen says nothing is sent:** a short note, which the email feature removes.

## The screen
- **The status control** sits right above the heart and Next, so the hand doesn't travel: two columns of three from 1024px, each button with its key; three columns of two in the phone's bottom bar, without keys. The chosen one is lime, or red for Rejected.
- **The playlist row** shows the status instead of "New" or "✓ Viewed" once it is past Applied. Rejected rows are dimmed.
- **The playlist filter:** a status select under All / Liked ("Any status", then each status, with counts). The two combine.
- **Next and ← keep to the list the playlist shows,** as before, now with the status filter too. If the narrowed list runs out while others are still new, Next carries on with the new ones and clears both filters.
- **Saved in the background,** like the other marks: it shows at once, and is put back with a short note if saving fails.
- **Keys are ignored** in inputs, in a dialog and in the open select. A focused select takes letters and digits for itself (type to choose), so `L`, `R` and the digits don't act on the applicant there; the arrows still move on.
- **For a screen reader,** the live line reads "Candidate 1 of 3: Ana Novak, Interview".

## How it is built

### Database: `supabase/migrations/20261102120000_application_stages.sql`
- `create type public.hiring_stage as enum ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED')`. The name `application_status` is already the candidate-side tracker's.
- **On `job_applications`:** `stage public.hiring_stage not null default 'APPLIED'` and `stage_changed_at timestamptz` (null until the first change).
- `grant update (stage, stage_changed_at)` to `authenticated`. The update policy from `applicant_review.sql` already limits it to the job's owner and active applications, so no new policy.

In the code the column is `stage`, so it isn't confused with `applications.status`; the screen calls it Status.

### Code
- **`src/lib/review/stages.ts`** (no `server-only`, the screen uses it): `HIRING_STAGES`, `HiringStage`, `HIRING_STAGE_LABELS`, `HIRING_STAGE_KEYS`, `stageForKey()`.
- **`src/lib/review/navigation.ts`:** `matchesPlaylist(item, filter, stageFilter)`, used by both the playlist and Next and ←, so they can't disagree. `nextTarget` and `previousTarget` don't change.
- **`src/lib/companies/workspace.ts`:** `getJobApplicants()` reads `stage`.
- **`setApplicationStage(id, stage)`** in `src/app/(employer)/[company]/actions.ts`: zod on the status, then the shared `setReviewMark` (uuid, employer account, the shared 120 a minute, "Application not found."). It writes `stage` and `stage_changed_at`.
- **`src/components/review/`:** `StageControl` and `StageDot` in `ats-panel.tsx`; the state, the keys and the filter in `applicant-review.tsx`; the row and the select in `candidate-playlist.tsx`.

## Verification

### Done
- **Checks.** `npm test` (323 tests, 15 new), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass.
  - `actions.test.ts`: an unknown status or a bad id is refused before anything runs, employer only, exactly `stage` and `stage_changed_at` on that application, no refresh, any status can go back, "Application not found.", a database error, the shared limit.
  - `navigation.test.ts`: `matchesPlaylist` alone and as the filter for Next and ←. `stages.test.ts`: each key, `R` in either case, other keys answer null, no two statuses share a key. `workspace.test.ts`: `stage` is mapped.
  - Breaking the code on purpose made the tests fail each time: ignoring the status filter (3 tests), accepting any string as a status, and not reading `stage` (1 test).
- **The screen, in a headless Chromium,** against `next dev`, with a temporary page (since removed) giving `ApplicantReview` five fixture applicants and the seed PDFs. Server Actions were held open or aborted, so **nothing here reached a database**. No console errors.
  - `1` to `5` and `R`/`r` set the status, as does a click or a tap; choosing the same one again sends nothing.
  - Choosing a status doesn't move on and doesn't mark viewed; Next does, and so does leaving by a row. A row click on an applicant with no status marks nothing.
  - Next from the last new applicant with a status, in the middle of the list, shows "All candidates viewed".
  - The filter narrows the list, says so when a status has nobody, and works inside the sheet at 1100px. Next at the end of a narrowed list carries on with the new ones and clears the filter.
  - Keys in the open select, and `R` on the focused select, leave the applicant's status alone. The arrows still move on from the select.
  - A failed save puts the status back with a note.
  - A status change doesn't redraw the documents: the same canvases stay, and no document is requested again.
  - No horizontal overflow, and the control is on screen with its text fitting, at 1920, 1280, 1100 and 390. The screenshots were looked at.

- **Supabase, with SQL, after the migration:**
  - the two columns and the enum exist, in order, with `APPLIED` as the default; all seven existing applications are at `APPLIED`;
  - `authenticated` has `update` on `liked_at`, `stage`, `stage_changed_at` and `viewed_at` only, and `anon` on nothing.
- **Row level security,** as `authenticated` with the real owner's JWT, in a `DO` block that ends with a deliberate exception (nothing kept, checked afterwards):
  - the owner sets a status (1 row, reads it back, `stage_changed_at` set) and goes back to `APPLIED` (1 row);
  - an unknown status is refused (`22P02`);
  - `matched_filters`, `cv_path`, `cover_letter_path`, `withdrawn_at`, `job_posting_id`, `candidate_id` and `applied_at` are refused (`42501`);
  - another real employer and a stranger change 0 rows, and so does the owner on a withdrawn application; `anon` is refused (`42501`);
  - `unpublish_job_posting` moving an application to another job keeps its status; a new application starts at `APPLIED` with `stage_changed_at` null.
- **Security advisors:** nothing new. The same three "SECURITY DEFINER executable" warnings, `rate_limits` without policies, and leaked-password protection off.
- **The real screen and database,** in a headless Chromium against `next dev`, no console errors. The three employer accounts in the database are on real addresses and none is documented as the test one, so this used a throwaway `@example.com` employer (made with the secret key, signed in through an admin magic link, no email sent), on its own demo job:
  - the review loads with the three real PDFs, all at Applied;
  - `3` saves Interview with its time and doesn't mark viewed, and a reload keeps the applicant and the status;
  - Next marks viewed; `r` saves Rejected, and that applicant's CV still opens through the document route;
  - leaving by a row marks the rejected one viewed, and marks nothing on the one it opens;
  - `2` then Next on the last new applicant shows "All candidates viewed";
  - after a reload the playlist shows each status, the filter narrows the list, and `1` puts a status back.
- **Afterwards:** the account was deleted, which took its company, job and applications with it, and its two rate limit counters were removed. Back to 3 companies, 7 jobs and 7 applications, all at `APPLIED` with no change time, and the marks already on the other demo jobs are untouched.

### Not done
- Safari and Firefox, a real touch device, and a screen reader pass.

## Order of release (the database is shared between development and production)
1. **The migration:** done. It only adds a type, two columns and a grant, so the code already deployed keeps working. The new code needs it: without the `stage` column the review screen fails to load.
2. **Commit, then push to `main`** (which deploys): done.

## Out of scope
- Sending anything to the candidate, and templates.
- Ending access to a rejected application's documents.
- A history of status changes (only the latest change's time is kept).
- Counts per status on the job card, and changing many at once.
- Showing the status to the candidate.
