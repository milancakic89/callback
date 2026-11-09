# Feature: Published Jobs on /jobs, and Applying with a CV

**Status:** Implemented in code, and **the migration is applied** (by hand in the SQL editor, so it isn't in the migration history under a version of its own: `published_job_postings()` and `my_job_application()` are in the database, checked 2026-11-09). `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass against it. Nothing has been checked in a browser. **The upload form described here is replaced** by [candidate-cvs.md](./candidate-cvs.md): the CV is one on the candidate's account, the candidate applies in a dialog, and a cover letter is typed or a PDF. The job board, the posting's page, the sign-in to apply and the server-side checks below stay as they are.

A published job is still shown to no candidate, so no real application can reach Fast Manual Mode: only the demo job has applicants. This puts published jobs on the job board, gives each one a page, and lets a signed-in candidate apply with a CV and a cover letter, both PDF. The files are kept in R2 ([document-storage.md](./document-storage.md)) and open in Fast Manual Mode like the demo ones.

**Scope when asked to implement "the plan":** only this document. It needs [company-slugs.md](./company-slugs.md) (the company's name on the posting) and [document-storage.md](./document-storage.md) (where the files go).

## Decisions (agreed with the user, 2026-11-09)
- **Only a candidate account can apply.**
  - A guest on a posting is offered "Sign in to apply" and "Create an account".
  - An application is tied to the account from the start (`job_applications.candidate_id` → `candidate_profiles`), so the candidate can follow it later.
- **Published jobs are listed first on `/jobs` and the candidate's `/dashboard`,** with the existing "Auto-tracked" look, and each has its own page, `/jobs/{id}`. The development fixture (`src/lib/jobs/dev-fixtures.ts` and its test) goes.
- **The form:** full name (required, filled in when the profile exists), location (optional), CV (PDF, required) and cover letter (PDF, optional), each up to 5 MB.
- **The candidate never writes to the tables.** After its checks, the server inserts the application with the secret key, so the file paths always come from the server.
- **The job's CV filters are never shown to a candidate** ([security.md](../project-overview/security.md)): the public read of a posting returns none of them.

## Where the code differs from the plan
- **`published_job_postings(p_job_id uuid default null)`** takes an optional id, so the posting's page asks for one job instead of reading all of them. It also leaves out a company that has no name or slug yet (not set up, [company-slugs.md](./company-slugs.md)), because a posting with no company to show makes no sense.
- **`applyToJob` asks the same function** whether the job is open (`supabaseAdmin.rpc("published_job_postings", { p_job_id })`), so the board, the page and the action agree on what a candidate can apply to.
- **The form submits by hand** (`onSubmit` and `startTransition(() => formAction(data))`) instead of `<form action>`: React resets uncontrolled fields after an action, which would throw away the chosen files after a failed submit. The browser also refuses a file over 5 MB or not a PDF before uploading it; the action checks the content again.
- **The posting page has its own small header,** not `SiteNav`: that bar says "Log in", which is wrong for a signed-in candidate or employer. A visitor with an account sees a link to their dashboard or workspace.
- **`next` on sign-in is `postingNext()`** (`src/lib/auth/safe-next.ts`): only `/jobs/<uuid>`, nothing longer. The same-origin check `safeNext()` moved there from `/auth/confirm`.
- **"View posting"** is also on the employer's job card, and the description sheet has "View posting and apply" for a posted job.
- **`updateTag("jobs")`** (Server Actions only, read-your-own-writes: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`) is called when a job is published, unpublished or deleted while published, and when a published job is edited. Editing a draft leaves the cached list alone.
- **A failed read of the published jobs fails the job list** (it throws, so the cache never keeps a list without them) instead of showing only scraped jobs for an hour.
- **File names:** `cleanDocumentName()` keeps letters, digits, spaces and `. _ -`, drops accents and folders, and caps at 80 characters; "Ana Novak CV.pdf" stays as it is, so Fast Manual Mode shows it.

## The screens
- **The page `/jobs/{id}`:** the title, the company, location, work mode, the posting date and the description as plain text. An unpublished job, the demo job or an unknown id is a 404.
- **The apply panel,** inside Suspense:
  - a guest sees "Sign in to apply" (`/sign-in?next=/jobs/{id}`) and "Create an account";
  - an employer sees a note that employers can't apply;
  - a candidate sees the form, or "You applied on 9 Nov 2026" once they have applied.
- **After sending,** the form is replaced by the confirmation.
- **On the employer side,** the application shows up at once:
  - in the count on the job card, and in Fast Manual Mode with its file names;
  - the screening overview says "Not checked yet".
- **The card of a published job** gets a "View posting" link.

## Plan

### 1. Database: a new migration
- **RPC `published_job_postings()`,** `security definer`, `search_path = ''`, executable by `anon` and `authenticated`.
  - It returns `id, title, description, location_raw, work_mode, published_at, company_name, company_slug` of jobs that are published and not demo.
  - It returns no filters, no `is_demo` and no counts.
- **RPC `my_job_application(p_job_id uuid) returns timestamptz`:** the caller's own `applied_at` for that job, or null.
  - Candidates get no access to `job_applications` rows, which also hold the company's `liked_at`, `viewed_at` and `matched_filters`.
- **No insert grant** for candidates on `job_applications` or `candidate_profiles`.

### 2. Data
- **`src/lib/jobs/queries.ts`:**
  - `getActiveJobs()` and `getJobDescriptions()` add the published jobs, through `supabasePublic`, under the same `'use cache'` and tag `jobs`;
  - new `getPublishedJob(id)`;
  - ids stay `callback:<uuid>` (`NATIVE_SOURCE`).
- **The job table:** a published job's title links to `/jobs/{id}` in the same tab (`table-parts.tsx`, `jobs-table.tsx`). Applied and Save stay "—" for these rows.
- **The cached list is refreshed** when a job is published, unpublished or edited while published. The `jobs` tag is expired from those actions; check `updateTag` against `revalidateTag` in `node_modules/next/dist/docs/` first.

### 3. The action `applyToJob` (`src/app/jobs/[jobId]/actions.ts`)
In this order:
1. **zod:** the job id, the name, the location, and the files. A file must be 1 byte to 5 MB, and start with `%PDF-` (the type the browser sends isn't trusted).
2. **The account:** `requireAccountType("candidate")`, then a rate limit of 10 an hour per candidate.
3. **The job:** it is published and not demo, and the candidate hasn't applied to it yet. Both are checked before anything is uploaded.
4. **The profile:** an upsert of `candidate_profiles` (name, location) with the secret key.
5. **The files:** uploaded to R2 at `applications/{applicationId}/{kind}/{cleaned-original-name}.pdf`. The existing `fileName()` in `src/lib/companies/workspace.ts` takes the last part of the path, so Fast Manual Mode shows the real file name with no change there.
6. **The application:** inserted with that id and those paths. If the insert fails (a duplicate included, `23505`), the uploaded files are deleted from R2.
7. **`refresh()`,** so the page shows the confirmation.

### 4. Limits on the request
`next.config.ts`:
- **`serverActions.bodySizeLimit`** to `11mb`. The default is 1 MB (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`).
- **`experimental.proxyClientMaxBodySize`** to `11mb`. The default is 10 MB, and above it the body is cut short (`proxyClientMaxBodySize.md`).
- Two files of 5 MB plus the fields need both raised.

### 5. Signing in to apply
- **`signIn` accepts `next`,** but only for `/jobs/...` paths.
  - The same-origin check (`safeNext` in `src/app/auth/confirm/route.ts`) moves to a shared helper.
- **Signing up** still ends on `/dashboard`, where the posting is listed first.

### 6. Text
The publish dialog (`src/components/employer/publish-job-button.tsx`) no longer says candidates will see the job "once Callback jobs are on the job board".

### 7. Tests (Vitest)
- **`applyToJob`:**
  - bad input touches nothing; a file that isn't a PDF and one over 5 MB are refused;
  - candidate only, and the limit;
  - an unpublished or demo job is refused, and so is a second application;
  - the files are deleted when the insert fails.
- **The queries:** a published job is mapped with no filters.
- **The `next` check:** only `/jobs/...` is accepted.

### 8. Documentation
This document; [companies.md](./companies.md) ("Later phases" 3 and 5), [dashboard.md](./dashboard.md), [applicant-review.md](./applicant-review.md), [architecture.md](../project-overview/architecture.md), [security.md](../project-overview/security.md), [roadmap.md](../project-overview/roadmap.md).

## Verification
**Done:** `npm test` (426 tests), `npm run lint`, `npx tsc --noEmit`, and breaking the new code on purpose (no PDF check, files not deleted after a failed insert, no cache expiry on publish: each turned the suite red). The build, see Status.

**Still to do:** everything below that needs the database or a browser, now with the dialog of [candidate-cvs.md](./candidate-cvs.md). The R2 side was checked on its own ([document-storage.md](./document-storage.md)).

**The checks to run:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and breaking the new code on purpose once.
- **With SQL,** as real users in a `DO` block that ends with a deliberate exception:
  - the public RPC returns no filters, no demo job and no unpublished job;
  - a candidate can't insert an application or read another's;
  - `my_job_application` only answers about the caller;
  - the security advisors show only the expected new "SECURITY DEFINER executable" findings.
- **In a headless Chromium against `next dev`,** with a throwaway `@example.com` employer and candidate, deleted afterwards with their files in R2:
  1. the employer publishes a job, and it is first on `/jobs`;
  2. a guest gets "Sign in to apply";
  3. the candidate applies with two PDFs and sees the confirmation;
  4. the employer sees the application in Fast Manual Mode with the real file names, and both documents open.
  - Also: a second application, a file that isn't a PDF and a 6 MB file are refused.
- Afterwards the database is back to the counts it had before the check.

## Order of release (the database is shared between development and production)
1. The migration (applied).
2. Commit, then push to `main` (which deploys), only when asked.

## Out of scope
- Applying without an account, and returning to the posting after signing up.
- Showing the candidate their application and its status in `/applications`, and emails.
- A company careers page.
- Checking CVs against the filters. (Written since: [cv-screening.md](./cv-screening.md). `applyToJob` screens the CV and stores the result with the application; it never refuses an application because of it.)
- Withdrawing an application as a candidate.
