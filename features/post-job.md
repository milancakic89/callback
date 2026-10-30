# Feature: Posting a Job

**Status:** Implemented. The migration is applied to Supabase (2026-10-30, recorded there as version `20261030050425`, so it differs from the file name, as the earlier migrations do) and checked with SQL, but **nothing is pushed to `main`** and the form has **not been looked at in a browser**, so production still runs the old form. `npm test` (221 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. See [Verification](#verification) for what was checked and what was not.

An employer fills in the "Create job" form (`/test/jobs/new`) and publishes the job. It is stored in `job_postings` for their company, and they land back on the dashboard with the new job at the top. In the candidate preview, the Apply button becomes **Upload CV**, which does nothing yet.

**Scope when asked to implement "the plan":** only this document. The workspace, the job form with its preview ([companies.md](./companies.md)), the `job_postings` table, the dashboard job list and deleting a job ([demo-job.md](./demo-job.md)) are done and need no work.

## Already in place (nothing to redo)

- **The job form** at `/test/jobs/new`: `src/components/employer/job-editor.tsx`, a controlled title and description with a live candidate preview. It has no `<form>` and no Server Action, so it stores nothing.
- **The tables** in `supabase/migrations/20261026210000_employer_jobs.sql`: `companies` (one row per employer account) and `job_postings` (`title`, `description`, `location_raw`, `work_mode`, `is_demo`, `created_at`). A company has `select` and `delete` on its jobs, but no `insert`.
- **The RPC `ensure_employer_workspace()`**, which creates the caller's company if there is none and returns its id. `ensureEmployerWorkspace()` in `src/lib/companies/workspace.ts` calls it and discards the id.
- **The dashboard** (`src/app/(employer)/[company]/page.tsx`) reads the company's jobs per request through `getCompanyJobs()`, newest first, so a new job shows up first with no change there.
- **Pieces to reuse:**
  - the `deleteJobPosting` action in `src/app/(employer)/[company]/actions.ts` and its tests (the order of checks, the mocks);
  - `rateLimit` with `postgresStore`;
  - `z.flattenError` for field errors, as `fieldErrors()` in `src/app/(auth)/actions.ts`;
  - `FieldError` and `FormAlert` from `src/components/auth/form-feedback.tsx`;
  - `WORK_MODES` and `WORK_MODE_LABELS` from `src/lib/jobs/types.ts`, `WorkModeBadge` from `src/components/jobs/work-mode-badge.tsx`;
  - the shadcn `select` component (`src/components/ui/select.tsx`).

## Context

The employer dashboard shows the demo job and a "Create job" button, but the form behind it stores nothing. This step makes the form save a real job for the signed-in employer's company. Showing these jobs to candidates and letting them apply come later.

### Decisions
- **The fields are the existing columns:** title, description, location and work mode (Remote / Hybrid / On-site). No new columns.
- **Title and description are required.** Location and work mode are optional; left empty, they are stored as `null`.
- **The job is visible only on the company's dashboard.** `/jobs` stays as it is, with the development fixture standing in for native jobs ([companies.md](./companies.md), "Later phases" 3).
- **Upload CV is the candidate's button, in the preview.** It replaces Apply, has no handler, and nothing about it is stored.
- **After publishing, the employer lands on the dashboard** (`/test`), where the new job is first.

## Plan

### 1. Database: a new migration `supabase/migrations/<timestamp>_job_postings_insert.sql`
It follows the existing migrations: a comment at the top, row level security, explicit grants.
- **An insert policy** for `authenticated`: `with check (not is_demo and exists (select 1 from public.companies c where c.id = job_postings.company_id and c.owner_id = (select auth.uid())))`.
  - A candidate has no row in `companies`, so they can insert nothing.
  - A company can't insert a job for another company.
- **A grant on columns only:** `grant insert (company_id, title, description, location_raw, work_mode) on public.job_postings to authenticated`. A client can't set `is_demo`, `id` or `created_at`.
- **Check constraints**, with the same limits as the form, so the database doesn't rely on the app:
  - `char_length(btrim(title)) between 1 and 120`;
  - `char_length(description) <= 10000`;
  - `location_raw is null or char_length(location_raw) <= 200`.
  - The demo job already meets them.

### 2. A shared schema: new `src/lib/companies/job-posting.ts`
No `server-only`, since the form uses it too.
- Constants `TITLE_MAX = 120`, `DESCRIPTION_MAX = 10_000` (both moved from `job-editor.tsx`) and `LOCATION_MAX = 200`.
- `jobPostingSchema` (zod):
  - `title` and `description`: trimmed, at least 1 character, at most the max;
  - `location`: trimmed, at most the max, empty → `null`;
  - `workMode`: one of `WORK_MODES`, or `""` → `null`.

### 3. The action `createJobPosting` in `src/app/(employer)/[company]/actions.ts`
The signature fits `useActionState`: `(prev: JobFormState, formData: FormData) => Promise<JobFormState>`, where `JobFormState = { error?: string; fieldErrors?: Record<string, string[] | undefined> }`, the same shape as `AuthFormState`. The checks run in the order `deleteJobPosting` uses:
1. zod, answering `{ fieldErrors }`;
2. `requireAccountType("employer")`;
3. `rateLimit` with `postgresStore` (key `create-job:<userId>`, 20 an hour);
4. the company id from `ensureEmployerWorkspace()`, which now **returns** it. This also covers an employer who opens the form before their first dashboard visit, when the company doesn't exist yet;
5. `insert` through the user's client (`createClient`), so row level security checks ownership. An error answers "Could not save the job. Try again.";
6. `redirect(companyHome(TEST_COMPANY))`. A redirect from an action streams the destination in the same response (Next.js docs: `02-guides/server-actions.md`), and the dashboard's data isn't cached, so no `revalidatePath` is needed.

### 4. The form: `src/components/employer/job-editor.tsx`
- It becomes a `<form action={formAction}>` with `useActionState(createJobPosting, {})`.
  - The fields stay controlled (the preview needs them), so React's form reset after a failed submit clears nothing. Same reason as in `src/components/auth/use-auth-form.ts`.
- **Left column:** Title and Description as now, plus:
  - **Location**, an `Input` (maxLength 200);
  - **Work mode**, the shadcn `Select` with the `WORK_MODE_LABELS` options and "Not specified". The value is submitted through the Select's `name`, or a hidden `<input>` if that doesn't work.
- **Errors:** `FieldError` under each field and `FormAlert` for a server error, with `aria-invalid` and `aria-describedby` as in the sign-in form.
- **Buttons** under the fields:
  - **Publish job** (`type="submit"`), disabled and reading "Publishing…" while pending (since [job-publishing.md](./job-publishing.md) it reads **Save job**: a new job is saved as a draft and published from its card);
  - **Cancel**, a link back to the dashboard. The editor gets a `companySlug` prop for it, which `src/app/(employer)/[company]/jobs/new/page.tsx` passes; that page's comment ("Nothing is stored yet") is updated.
- **The preview** (right column):
  - under the company name, the location and a `WorkModeBadge` when they are filled in;
  - **Apply becomes Upload CV** (`UploadIcon`, `type="button"`, no handler), with the note "Preview: candidates will upload their CV here."

### 5. Tests (Vitest, like the existing ones)
- **New `src/lib/companies/job-posting.test.ts`:** trimming; title and description required; the max lengths; an empty location and an empty work mode become `null`; an unknown work mode is refused.
- **`src/app/(employer)/[company]/actions.test.ts`**, a new `describe("createJobPosting")`. The mocks gain `insert` next to `delete`, plus `ensureEmployerWorkspace` and `redirect` from `next/navigation`.
  - bad input answers `fieldErrors` and doesn't touch the database;
  - needs an employer account;
  - the rate limit key is `create-job:user-1`, and a request over the limit is refused;
  - inserts exactly the five columns, with the company id from the workspace and **no** `is_demo`;
  - a database error answers the message and doesn't redirect;
  - success redirects to `/test`.

### 6. Documentation
- This document gets a status and a verification section.
- [companies.md](./companies.md): "Later phases" 2 and the "Where this stands" table point here.
- [demo-job.md](./demo-job.md): "Out of scope" points here for saving jobs from the form.
- [roadmap.md](../project-overview/roadmap.md), [architecture.md](../project-overview/architecture.md) (the insert grant) and [security.md](../project-overview/security.md) (the insert policy, the column grant, the check constraints, the rate limit).

## Order of release
The database is shared between local development and production.
1. **The migration in Supabase**, through the Supabase MCP (`apply_migration`), after a go-ahead. It is safe before the code: it only adds a permission and constraints.
2. **Commit, then push to `main`** (which deploys) only when asked.

If the code reached production before the migration, publishing would answer "Could not save the job"; nothing else breaks.

## Files
- **New:**
  - `supabase/migrations/<timestamp>_job_postings_insert.sql`;
  - `src/lib/companies/job-posting.ts` and its test.
- **Changed:**
  - `src/app/(employer)/[company]/actions.ts` and its test;
  - `src/lib/companies/workspace.ts` (`ensureEmployerWorkspace()` returns the id);
  - `src/components/employer/job-editor.tsx`, `src/app/(employer)/[company]/jobs/new/page.tsx`;
  - the documentation in step 6.

## Verification
1. `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. The build still prerenders `/test` and `/test/jobs/new`.
2. **After the migration, with SQL:**
   - the policy and the grants exist, and `information_schema.column_privileges` shows insert on the five columns only;
   - `anon` has nothing;
   - the security advisors report nothing new;
   - in a rolled-back transaction as `authenticated` with a company owner's JWT: an insert into their own company passes; one into another company, or with `is_demo = true`, is refused; an empty title breaks the constraint.
3. **As an employer on `/test/jobs/new`, in a browser:**
   - a whitespace-only title or description (an empty one is stopped by the browser's `required`) shows the field error from the server and keeps what was typed;
   - the preview follows the location and work mode, and Upload CV does nothing;
   - a filled-in submit lands on `/test` with the new job first, "0 applicants" and no Demo badge;
   - deleting the new job works;
   - the job doesn't appear on `/jobs`.

### Done
- **`npm test`** (221 tests, 16 of them new), **`npm run lint`**, `npx tsc --noEmit` and **`npm run build`** pass. The build still prerenders `/test` and `/test/jobs/new`.
  - `src/lib/companies/job-posting.test.ts`: required and optional fields, trimming, the length limits, CRLF counted as one character, an unknown work mode refused.
  - `createJobPosting` in `actions.test.ts`: invalid input touches nothing, an employer account is required, the 20 an hour limit, the insert has exactly the five columns with the company id from the workspace, a `company_id` or `is_demo` sent in the form is ignored, a database error or a missing company doesn't redirect, success redirects to `/test`.

### On Supabase (after applying the migration)
- **The grants and policies:** `authenticated` has `insert` on exactly `company_id, description, location_raw, title, work_mode` (and still `select`, `delete` on the table); `anon` has nothing; the three check constraints and the "Companies can insert their jobs" policy exist. The existing row (the demo job) met the constraints before they were added.
- **The security advisors** report nothing new: the same three findings as before (`rate_limits` without policies, `ensure_employer_workspace()` executable by signed-in users, leaked-password protection off).
- **Row level security**, in a `DO` block that ends with a deliberate `raise exception` so nothing is kept (a count afterwards showed the one original row), run as `authenticated` with a JWT built from a real company's owner id:
  - the owner inserts a job into their own company, and one with the maximum lengths;
  - setting `is_demo` or `id` is refused (permission denied: not in the column grant);
  - a blank title, a 121-character title, a 10,001-character description and a 201-character location each violate their check constraint;
  - a random user id inserting into that company is refused by row level security;
  - `anon` is refused.

### Not done
- **The form in a browser** (it needs a signed-in employer):
  - the work mode select submitting through its hidden input (the select's trigger is `type="button"` in Base UI, so opening it shouldn't submit the form, but that is from the source, not from a click);
  - the preview, the Upload CV button and the redirect with the new job first on `/test`;
  - the field errors for a whitespace-only title or description.
- **The Server Action against the real database**, as a signed-in employer. The tests mock Supabase; the policies were checked with SQL, not through the action.
- **Pushing to `main`**, and the deploy that follows.

## Out of scope
- Showing native jobs to candidates on `/jobs`, and a job page for candidates.
- Actually uploading a CV (Storage, a candidate applying).
- Editing a job, drafts, a company name and a real slug.
