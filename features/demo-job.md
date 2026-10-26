# Feature: Demo Job and Mock Candidates

**Status:** Implemented. The migration is applied to Supabase and the seed has run (2026-10-26), but **nothing is pushed to `main` yet**. An employer has already visited the dashboard (the demo job exists, see below), but the page has **not been looked at in a browser by Claude**, so the card, the delete dialog and the empty state are unchecked. `npm test` (126 tests), `npm run lint` and `npm run build` pass. See [Verification](#verification) for what was checked and what was not.

When an employer first opens their dashboard, they already have **one demo job with three applicants**: fictional candidates who are real accounts in the database. The employer can delete the demo job. The three candidates stay in the database and serve every company that registers later. It prepares the ground for reviewing applicants (CV and cover letter, Fast Manual Mode) as the next feature.

**Scope when asked to implement "the plan":** only this document. The first step in [companies.md](./companies.md) (workspace, dashboard button, job form, Callback jobs first in the list) is **done**; its sections 1 to 4 need no work. What this document adds was the list under [Not in place yet](#not-in-place-yet): all of it now exists, and what is left is the push and a look in the browser.

## Already in place (nothing to redo)

- **Account types.** `requireAccountType("employer")` and the candidate/employer split ([account-types.md](./account-types.md)).
- **The employer workspace** under the company's slug, which is still the fixture company `TEST_COMPANY` (`/test`): `src/app/(employer)/[company]/` with its layout, `getCompanyOrNotFound`, the dashboard with "No jobs yet" and the "Create your first job" button, and `/test/jobs/new`, a job form with a live candidate preview that stores nothing ([companies.md](./companies.md), steps 1 to 3).
- **Callback jobs first and highlighted** in the candidate job table, backed by a development-only fixture ([companies.md](./companies.md), step 4).
- **The three fictional candidates** as landing-demo data: `SAMPLE_CANDIDATES` in `src/components/landing/sample-documents.tsx` (Ana Novak, Jonas Weber and Priya Raman, each with a CV and a cover letter component and a file name).
- **Pieces to reuse:**
  - `rateLimit` with `postgresStore` (`src/lib/rate-limit.ts`, `src/lib/supabase/rate-limit-store.ts`);
  - the cookie-bound client `createClient` (`src/lib/supabase/server.ts`);
  - `loadEnv` and `createAdminClient` in `scraper/supabase.ts`;
  - the `AlertDialog` confirm pattern in `src/components/jobs/apply-confirm-dialog.tsx`;
  - the enum `public.work_mode`.
- **Unit tests** (Vitest) run in CI before every deploy ([testing.md](../project-overview/testing.md)), and the app is live ([deployment.md](../project-overview/deployment.md)).

## Not in place yet

**Written** (the list this section held before the work): the four tables and the RPC `ensure_employer_workspace` in `supabase/migrations/20261026210000_employer_jobs.sql`; the mock candidates (`src/lib/candidates/mock-candidates.ts`) and the seed script; the dashboard with the job card and the delete action.

**Done since:** the migration is applied to Supabase (recorded there as version `20261026200006`, so it differs from the file name, as the earlier migrations do), and `npm run seed:mock-candidates` has run: three accounts and three profiles exist.

**Still missing:**
- Nothing is pushed to `main`, so production still runs the old dashboard.

## Context

Today every employer account shares the fixture company `test`, and nothing about a company is stored. The next feature, reviewing applicants, needs a job with applications to look at. Rather than wait for candidates, every company starts with a demo job and three applicants it can work with.

### Decisions
- **Every company has its own jobs.** A `companies` table gets one row per employer account, created automatically. The URL stays `/test`; a company name and a real slug (`/acme`) are a later step.
- **The mock candidates are real accounts** in Supabase Auth: candidate type, sign-in blocked, an `@example.com` address. They are the same three people as the landing demo, so the review feature can show their documents straight away.
- **The demo job is created on the first dashboard visit, once per company**, and never comes back after it is deleted. Existing employer accounts, the test account included, get it on their next visit.
- **The "Create job" form still stores nothing.** Saving new jobs is a separate step.
- **The demo job is private:** it is never on `/jobs`, and on the dashboard it carries a **Demo** badge. Its title is "Senior Product Designer", the role the landing documents were written for (the letters mention the company "Halden", which is fine for a demo).
- **The dashboard shows the job and how many people applied, not who they are.** The card has the title, the **Demo** badge, the count, and a **Run manual mode** button that does nothing yet. Who the applicants are, and their CVs, belong to the review feature that button will start.

## Plan

### 1. Database: a new migration `supabase/migrations/<timestamp>_employer_jobs.sql`
It follows the existing migrations (`saved_jobs.sql`, `applications_status.sql`): row level security on, `revoke all` from `anon` and `authenticated`, then only the grants that are needed.

- **`companies`**
  - Columns: `id uuid` primary key; `owner_id uuid not null unique` → `auth.users` (on delete cascade); `name text` (null until onboarding); `demo_seeded_at timestamptz`; `created_at`.
  - The owner can read their row. Clients don't write; the RPC below creates it.
- **`candidate_profiles`**
  - Columns: `user_id uuid` primary key → `auth.users` (on delete cascade); `full_name text not null`; `location text`; `is_mock boolean not null default false`; `sample_key text unique` (the link to the landing demo data, e.g. `ana-novak`); `created_at`.
  - A user can read their own profile, and a company can read the profiles of candidates who applied to its jobs. Only the service role writes.
- **`job_postings`** (a company's jobs, separate from the scraped `jobs` table)
  - Columns: `id uuid` primary key; `company_id` → `companies` (on delete cascade); `title`; `description`; `location_raw`; `work_mode public.work_mode`; `is_demo boolean`; `created_at`.
  - A company reads and deletes its own jobs (`grant select, delete`).
- **`job_applications`** (separate from the candidate-side tracker `applications`)
  - Columns: `id uuid` primary key; `job_posting_id` → `job_postings` (on delete cascade); `candidate_id` → `candidate_profiles(user_id)` (on delete cascade, so a query can join an application with its profile); `applied_at`; `unique (job_posting_id, candidate_id)`.
  - A company reads the applications to its own jobs. Deleting a job deletes its applications, and the mock candidates stay.
- **RPC `public.ensure_employer_workspace()`** (security definer, `search_path = ''`, execute for `authenticated` only):
  - It checks that `auth.uid()` is an employer (`auth.jwt() -> 'app_metadata' ->> 'account_type'`) and raises an error otherwise.
  - It creates the company if there is none (`on conflict (owner_id) do nothing`) and locks its row (`for update`), so two simultaneous visits can't make two jobs.
  - If `demo_seeded_at` is null and at least three mock profiles exist, it inserts the demo job and one application per mock candidate, then sets `demo_seeded_at`, all in one transaction.
  - If the mock candidates don't exist yet, it does nothing, so the demo job is made on a later visit, once the seed script has run.
  - It returns `company_id`.

### 2. Mock candidates
- **New `src/lib/candidates/mock-candidates.ts`** (plain data): key, name, location, email (`ana.novak@example.com` and so on) and the CV and letter file names.
  - `SAMPLE_CANDIDATES` in `src/components/landing/sample-documents.tsx` takes its data from here and only adds the document components, so the landing page, the seed script and the dashboard share one source.
- **New script `scripts/seed-mock-candidates.ts`**, run with `npm run seed:mock-candidates` (`node --import tsx`, like `scrape`). It uses `loadEnv` and `createAdminClient` from `scraper/supabase.ts`.
  - For each candidate it finds the account by email or creates it: `email_confirm: true`, a random password, `app_metadata: { account_type: "candidate", mock: true }`, and a `ban_duration` of 100 years so nobody can sign in with it.
  - Then it upserts the row in `candidate_profiles` with `is_mock = true`.
  - It is idempotent: a second run creates nothing new.
  - Local development and production share one Supabase project, so it runs once.

### 3. The app
- **New `src/lib/companies/workspace.ts`** (`server-only`):
  - `ensureEmployerWorkspace()` calls the RPC through the user's client.
  - `getCompanyJobs()` reads `job_postings` with `job_applications(count)`, an aggregate embed that answers `[{ count: n }]`. Row level security makes sure they are only that company's jobs, and only the applications to them.
- **`src/app/(employer)/[company]/page.tsx`:** inside the existing component under `Suspense` (after `requireAccountType("employer")`) it calls `ensureEmployerWorkspace()` and then `getCompanyJobs()`.
  - No jobs: the existing `EmptyState` with "Create your first job".
  - Jobs: a list of cards, with a "Create job" link below.
- **New `src/components/employer/job-card.tsx`:** the title, a **Demo** badge, a short note ("A sample job with fictional applicants. Delete it whenever you like."), the number of applicants, and a **Run manual mode** button. The button has no handler, like the Apply button in the job editor's preview, until the review feature exists.
- **New `src/components/employer/delete-job-button.tsx`** (client): a confirmation in the existing `AlertDialog`, then the action, with a pending state and an error.
- **New `src/app/(employer)/[company]/actions.ts`**, the action `deleteJobPosting(jobId)`:
  - zod (uuid) and `requireAccountType("employer")`;
  - `rateLimit` with `postgresStore` (key `delete-job:<userId>`, 30 per minute), like `setSaved`;
  - `delete().eq("id", jobId).select("id")` through the user's client, answering "Job not found" when no row was deleted;
  - finally `refresh()` from `next/cache` (Next.js docs: `refresh.md`).

### 4. Tests (Vitest, like the existing ones)
- **`src/lib/candidates/mock-candidates.test.ts`:** exactly three candidates, unique keys and emails, all on `example.com`, and each has its pair of documents in `SAMPLE_CANDIDATES`.
- **`src/app/(employer)/[company]/actions.test.ts`** (mocks as in `src/app/auth/confirm/route.test.ts`):
  - refuses an id that isn't a uuid;
  - needs an employer account;
  - answers "Job not found" when row level security deletes nothing;
  - deletes the job and calls `refresh`;
  - honours the rate limit.
- **The database and row level security are checked by hand, with SQL** (see Verification). Integration tests against a database stay for later ([testing.md](../project-overview/testing.md)).

### 5. Documentation
- This document gets a status and a verification section.
- [architecture.md](../project-overview/architecture.md): the data model (four new tables and the RPC).
- [security.md](../project-overview/security.md): row level security for the new tables and the blocked mock accounts.
- [roadmap.md](../project-overview/roadmap.md) and [testing.md](../project-overview/testing.md): updated.
- [companies.md](./companies.md): its "Later phases" 1 and 2 point here.

## Order of release
The database is shared between local development and production.
1. **The migration in Supabase:** either paste the SQL into the SQL editor, or authorise the Supabase MCP (`/mcp`) so Claude can apply it.
2. **`npm run seed:mock-candidates`**, once.
3. **Commit and push to `main`**, which runs the tests and deploys.

If the code reached production before the migration, the dashboard would fail on the RPC, and the health check would not notice, because it doesn't touch these tables.

## Files
- **New:**
  - `supabase/migrations/<timestamp>_employer_jobs.sql`;
  - `src/lib/candidates/mock-candidates.ts`, `scripts/seed-mock-candidates.ts`;
  - `src/lib/companies/workspace.ts`, `src/app/(employer)/[company]/actions.ts`;
  - `src/components/employer/job-card.tsx`, `delete-job-button.tsx`;
  - the tests next to them.
- **Changed:**
  - `src/app/(employer)/[company]/page.tsx`;
  - `src/components/landing/sample-documents.tsx` (imports its data);
  - `package.json` (the `seed:mock-candidates` script);
  - the documentation in step 5.

## Verification

### Done
- **`npm test`** (126 tests, 12 of them new), **`npm run lint`**, `npx tsc --noEmit` and **`npm run build`** pass. The build still prerenders `/test`.
- **The new tests fail when the code is broken** (checked by hand, then restored): a non-uuid id let through, no "Job not found", no `refresh()`, a limit of 31 instead of 30, the candidate account type instead of the employer one, a mock email off `example.com`, a duplicate key.
- **The migration and the RPC, in a throwaway Postgres 16** (Docker, with stand-ins for `auth.users`, `auth.uid()`, `auth.jwt()` and the `anon`, `authenticated` and `service_role` roles). This is Postgres, not Supabase: it proves the SQL and the policies, not the Supabase platform. Results:
  - The migration applies without error.
  - **A first visit** by an employer makes one company, the demo job ("Senior Product Designer", `HYBRID`, `is_demo`) and three applications. A second call changes nothing.
  - **A visit before the seed** makes the company and no job, with `demo_seeded_at` null; a visit after the seed makes the job.
  - **Deleting the job** removes its applications and keeps the three profiles. The job doesn't come back on the next visit (`demo_seeded_at` is set).
  - **A second employer** gets their own demo job and sees no other company's jobs, applications or company row. Deleting another company's job deletes 0 rows.
  - **A company sees only its applicants' profiles**; a candidate sees only their own profile and no jobs or applications.
  - **Refused:** a candidate calling the RPC ("Only an employer account has a workspace"), the same for a call with no JWT, `anon` on every table and on the RPC (permission denied), and an employer's `insert` or `update` on any of the four tables.

### On Supabase (after applying the migration and running the seed)
- **The migration** applied without error. All four tables have row level security on and exactly the policies and grants above: `authenticated` has `select` on all four and `delete` on `job_postings`, and `anon` has nothing. The RPC is `security definer` with `search_path=""`, executable by `authenticated` and not by `anon`.
- **The security advisors** report one new finding: `ensure_employer_workspace()` is executable by signed-in users as a `SECURITY DEFINER` function. That is the design: it is how an employer makes their company, and it refuses any JWT that isn't an employer's. The other findings (`rate_limits` without policies, leaked-password protection off) were already there.
- **The seed** made three accounts: confirmed, `app_metadata` `{ account_type: "candidate", mock: true }`, banned for about a hundred years, each with a profile (`is_mock`, the right `sample_key`). A second run printed the same three ids and created nothing.
- **The PostgREST embed** in `getCompanyJobs()` (`job_applications(count)`) resolves, and its shape is the one the code reads: a read-only query with the secret key returned the demo job with `[{ "count": 3 }]`. That job was made by a real employer visit to the dashboard (the secret key bypasses row level security, so this says nothing about what an employer is allowed to see).

### Not done
- **Row level security for a real employer, as a test.** The policy checks above ran in Postgres with a stand-in for `auth`, and reading the employer accounts to repeat them in a rolled-back transaction was refused. What is known on Supabase is that the RPC ran for a real employer (one demo job with three applications exists) and that the grants are as listed; a second employer not seeing the first one's job has not been checked there.
- **The dashboard in a browser:** the demo job card, the Demo badge, the delete dialog and its error state, and the empty state.
- **Pushing to `main`**, and the deploy that follows.

### The plan's checklist, and where each item stands
1. `npm test`, `npm run lint` and `npm run build`: **done**.
2. **After the migration, with SQL:**
   - the tables, policies and grants exist;
   - `anon` sees nothing;
   - the RPC refuses a candidate.
3. **After the seed:**
   - three accounts and three profiles with `is_mock`;
   - a second run creates nothing new;
   - signing in with a mock account fails (banned).
4. **As an employer (the test account) on `/test`:**
   - the demo job with "3 applicants" and the Run manual mode button;
   - "Delete" with its confirmation removes it, and it doesn't come back after a reload;
   - the mock accounts and profiles are still in the database;
   - `demo_seeded_at` is set.
5. **A second company:** another employer account gets its own demo job and doesn't see the first one's jobs. This needs a second employer account (a throwaway one made with the admin API and deleted afterwards), so ask before making it.
6. **The candidate side:** the demo job doesn't appear on `/jobs` or `/dashboard`.

## Out of scope
- Saving jobs from the "Create job" form.
- A company name and a real slug.
- Opening a candidate's CV and letter, and changing an application's status: the review feature, built on this data.
- Real candidates applying to a company's jobs.
