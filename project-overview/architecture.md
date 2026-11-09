# Callback — Architecture

## Route Map

| Route | Access | Purpose |
|---|---|---|
| `/sign-in` | Public | Sign in with email/password |
| `/sign-up` | Public | Create a new account |
| `/forgot-password` | Public | Request a password reset |
| `/reset-password` | Authenticated (via recovery link) | Set a new password |
| `/auth/confirm` | Public (Route Handler) | Verifies email links (`token_hash` + `verifyOtp`), then redirects |
| `/` | Public | Landing page: what Callback does for candidates (live today) and employers (in development), with an interactive Fast Manual Mode demo. Signed-in visitors are redirected to their home (`/dashboard`, the company home `/{slug}`, or `/setup`). See [features/landing.md](../features/landing.md). |
| `/jobs` | Public | The job list: search, filters, no Applied column. Was `/` until the landing page; old `/?q=`, `?f=`, `?sort=` links redirect here. Jobs posted on Callback are always listed first and highlighted ([features/companies.md](../features/companies.md)). See [features/dashboard.md](../features/dashboard.md). |
| `/dashboard` | Authenticated | Same job list, plus the Applied column and filter, and the Save job heart column. |
| `/saved-jobs` | Authenticated | The dashboard table scoped to the jobs the user saved (same columns, search, filters and description sheet). Unticking a heart removes the row. Jobs the scraper has taken down stay listed as Expired. See [features/saved-jobs.md](../features/saved-jobs.md). |
| `/api/jobs/descriptions` | Public (Route Handler, `GET`) | Job descriptions, fetched client-side after the table renders. |
| `/api/health` | Public (Route Handler, `GET`) | What the deploy checks after a restart; answers 500 when the environment is invalid. See [deployment.md](./deployment.md). |
| `/applications` | Authenticated | Table of the jobs the user applied to: Label, Company, Applied date and a Status dropdown. Jobs the scraper has taken down stay listed as Expired. See [features/applied.md](../features/applied.md). |
| `/setup` | Authenticated, employer accounts | Once, after activation: the company's name and its address (slug). Continue, for a company whose address the session doesn't know yet. See [features/company-slugs.md](../features/company-slugs.md). |
| `/jobs/{id}` | Public | A job a company published on Callback: the posting, and the apply panel (sign in to apply, a note for employers, or the form with a CV and a cover letter as PDF). An unpublished job, the demo job and an unknown id are the not-found page. See [features/apply-with-cv.md](../features/apply-with-cv.md). |
| `/{company}` | Authenticated, employer accounts | The company's workspace, at the slug chosen on `/setup`: its own sidebar and a dashboard with its jobs. Another company's slug or an unknown one is a 404. See [features/companies.md](../features/companies.md). |
| `/{company}/profile` | Authenticated, employer accounts | The company profile: a description of what the company does, a website, industry, size and headquarters, with a live preview of the "About" card candidates see. See [features/company-profile.md](../features/company-profile.md). |
| `/companies/{slug}` | Public | A company's page: its profile and the jobs it has published. A slug that isn't a company's, or a company not set up, is the not-found page. See [features/company-profile.md](../features/company-profile.md). |
| `/{company}/jobs/new` | Authenticated, employer accounts | The job form: title and description with a live candidate preview. Nothing is stored yet. |
| `/{company}/jobs/{jobId}/review` | Authenticated, employer accounts | Reviewing a job's applicants on the whole screen: playlist, CV, cover letter, screening overview, heart and Next. See [features/applicant-review.md](../features/applicant-review.md). |
| `/api/applications/{id}/documents/{cv\|cover-letter}` | Employer and candidate accounts (Route Handler, `GET`) | An application's PDF: for the review viewer, checked with row level security on every request, refusing browser navigations; or for the candidate who applied, their own active application only. With `/api/cvs/{id}`, the only way to the private R2 bucket ([features/document-storage.md](../features/document-storage.md)). |
| `/api/cvs/{id}` | Candidate accounts (Route Handler, `GET`) | A CV on the signed-in candidate's account, opened in a tab ([features/candidate-cvs.md](../features/candidate-cvs.md)). |
| `/profile` | Authenticated, candidate accounts | "Your CVs": up to 5 PDFs on the account, opened, uploaded and deleted here; one in use by an active application can't be deleted ([features/candidate-cvs.md](../features/candidate-cvs.md)). |
| `/dev/documents` | Development only | The demo documents as A4 sheets, printed to PDF by `npm run demo:documents`; 404 in production. |

## Layout

- Public auth routes (`/sign-in`, `/sign-up`, `/forgot-password`) use a minimal centered-form layout.
- `/` is a dark marketing page with its own footer (`src/components/landing/`, styles scoped to `[data-landing]` in `landing.css`). Its sticky nav (`src/components/site-nav.tsx`) is shared with `/jobs`.
- Everything a signed-out visitor reaches from the landing page keeps its dark look: the auth layout adds the `dark` class (the `.dark` tokens in `globals.css` are the landing's palette), and `/jobs` has the dark nav over a light table. `<DarkSurface />` keeps `<html>` dark behind those pages. Lime (`--primary`) is the one accent across the app, used as a fill only, never as text on white. See [features/visual-continuity.md](../features/visual-continuity.md).
- `/jobs` and `/dashboard` differ in their header (shared nav vs. the signed-in shell) around the same job table.
- The signed-in shell (`src/app/(app)/layout.tsx`) is a sidebar from `md` (768px) up. Below that it becomes a top bar whose burger button expands and hides the menu. Tables turn into stacked cards there — see "Responsive" in [features/dashboard.md](../features/dashboard.md).
- A signed-in visitor hitting `/` or `/jobs`, or a signed-out visitor hitting `/dashboard`, a company's slug, `/setup` or `/reset-password`, is redirected (`src/proxy.ts`, rules in `src/lib/auth/route-gate.ts`). `/jobs/{id}` is open to everyone.
- **Two account types** ([features/account-types.md](../features/account-types.md)). `/dashboard`, `/saved-jobs`, `/applications` and `/profile` are the candidate side, in `src/app/(app)/layout.tsx`. `/{company}` is the employer side, in `src/app/(employer)/[company]/(workspace)/layout.tsx`, which is the same shell with its own sidebar items; the applicant review is outside it, in `(review)/layout.tsx`, dark and on the whole screen ([features/applicant-review.md](../features/applicant-review.md)). Each side redirects the other type to its own home.
- After sign-up, the auth layout shows the account-type dialog (`AccountTypeGate`) while a pending-signup cookie exists.

## Request Pipeline

- `next.config.ts` adds security headers and the CSP to every response.
- `src/proxy.ts` (Next.js 16's replacement for `middleware.ts`, always on the Node runtime) applies the global per-IP rate limit. It also refreshes the Supabase session cookies and redirects based on the session, but it must never be the only auth check.
- `src/lib/rate-limit.ts` provides `getClientIp()` and `rateLimit()` with a swappable counter store, reused by auth Server Actions in Phase 1.

See [security.md](./security.md) for details.

## Data Model (Draft — Subject to Change)

Supabase/Postgres tables. Marked draft because the `jobs` shape depends on decisions not yet made (job source).

### `users`
Managed entirely by Supabase Auth — no custom table needed unless profile fields are added later.

### `jobs`
Scraped job postings, filled by `npm run scrape -- publish` from `scraper/data/jobs.json` (see [job-scraper.md](../features/job-scraper.md#publishing-to-supabase)). Migration: `supabase/migrations/*_jobs.sql`.

- `id` (text, primary key, `<source>:<externalId>`), `company_joberty_id`, `company_name`, `title`, `location_raw`, `country` (ISO alpha-2), `is_remote`, `remote_scope`, `department`, `url` (http(s) only), `description` (plain text), `source`, `posted_at`, `first_seen_at`, `last_seen_at`, `active`, `work_mode` (`public.work_mode` enum: `REMOTE` / `HYBRID` / `ON_SITE`, nullable — computed by the scraper at publish time, see [features/dashboard.md](../features/dashboard.md))
- `search_text`: generated lowercase `title + company_name`, for `ilike` search
- Index: partial on `(first_seen_at desc, id) where active`, for the public list
- RLS: `anon` and `authenticated` can `select` active rows only. There are no write policies, so only `service_role` (the scraper's `publish`) can write.

### `applications`
One row per (user, job) the user applied to: `user_id`, `job_id` (references `jobs.id`), `applied_at`, `status` (`public.application_status` enum: `PENDING` / `NO_ANSWER` / `REJECTED` / `OFFER`, default `PENDING`). Primary key `(user_id, job_id)`. Backs the Applied checkbox on `/dashboard` and the `/applications` page ([features/applied.md](../features/applied.md)).

- RLS: `authenticated` can `select` and `insert` only their own rows (`user_id = auth.uid()`), and `update` only the `status` column of their own rows (column-level grant). There is no delete policy or grant: applying is irreversible.
- A second `select` policy on `jobs` ("Users can read jobs they applied to") lets a user read a job they applied to even after the scraper sets `active = false`, so `/applications` can show it as Expired.

### `saved_jobs`
One row per (user, job) the user saved: `user_id`, `job_id` (references `jobs.id`), `saved_at`. Primary key `(user_id, job_id)`. Backs the Save job heart on `/dashboard` and the `/saved-jobs` page ([features/saved-jobs.md](../features/saved-jobs.md)).

- RLS: `authenticated` can `select`, `insert` and `delete` only their own rows (`user_id = auth.uid()`). Saving toggles both ways, so unlike `applications` there is a delete policy. There is no update policy or grant.
- A third `select` policy on `jobs` ("Users can read jobs they saved") lets a user read a saved job even after the scraper sets `active = false`, so `/saved-jobs` can show it as Expired.

### Employer tables (`companies`, `candidate_profiles`, `job_postings`, `job_applications`)
Applied to Supabase on 2026-10-26. Migration: `supabase/migrations/20261026210000_employer_jobs.sql`; the design is in [features/demo-job.md](../features/demo-job.md).

- `companies`: one row per employer account (`owner_id`, unique, → `auth.users`), `name` (null until onboarding) and `demo_seeded_at`. Made by the RPC below on the first dashboard visit.
- `candidate_profiles`: what an employer sees of a candidate (`user_id`, `full_name`, `location`, `is_mock`, a unique `sample_key` that ties a mock candidate to `src/lib/candidates/mock-candidates.ts`). Only the mock candidates have one for now, written by `npm run seed:mock-candidates`.
- `job_postings`: a company's own jobs (`company_id`, `title`, `description`, `location_raw`, `work_mode`, `is_demo`), separate from the scraped `jobs`. Deleting one cascades to its applications.
- `job_applications`: `job_posting_id` and `candidate_id` (→ `candidate_profiles.user_id`, so a query can join the two), `applied_at`, unique per pair. Separate from `applications`, the candidate-side tracker.
- **RPC `ensure_employer_workspace()`** (security definer, executable by `authenticated` only): refuses anyone whose JWT isn't an employer, creates the company, and once, under a row lock, makes the demo job with one application from each of three mock candidates. It leaves `demo_seeded_at` null while the mock candidates don't exist, so the demo job appears after the seed.
- RLS: a company reads and (for jobs) deletes only its own rows, and reads only the profiles of candidates who applied to its jobs. The one insert a client has is a job into its own company, below; the update grant is in the next bullet.
- **Publishing a job** (applied to Supabase on 2026-10-30; [features/post-job.md](../features/post-job.md), migration `supabase/migrations/20261030120000_job_postings_insert.sql`): an insert policy on `job_postings` for the company's owner (`not is_demo`), an insert grant on five columns only (`company_id`, `title`, `description`, `location_raw`, `work_mode`), and check constraints on the lengths (title 1 to 120, description up to 10,000, location up to 200).
- **Editing and publishing** (applied to Supabase by hand on 2026-10-30; [features/job-publishing.md](../features/job-publishing.md), migration `supabase/migrations/20261030140000_job_publishing.sql`): `job_postings.published_at` (null = draft) and `job_applications.withdrawn_at` (null = active); an update policy on `job_postings` for the company's owner (`not is_demo`) with an update grant on four columns (`title`, `description`, `location_raw`, `work_mode`); and two `security definer` RPCs, `publish_job_posting(uuid)` and `unpublish_job_posting(uuid, text, uuid)`, which are the only things that change `published_at`. Unpublishing settles the active applications in one transaction: keep, withdraw, or move to another non-demo job of the company without duplicating a candidate already there.
- **CV filters** (applied to Supabase on 2026-10-30 and checked with SQL; [features/job-filters.md](../features/job-filters.md), `supabase/migrations/20261030160000_job_posting_filters.sql`): `job_postings.required_filters` and `optional_filters`, both `text[] not null default '{}'`, written and read with the job from the one form, so the existing insert and update do it. A check constraint calls `public.job_filters_valid(text[], text[])` (`immutable`, `search_path = ''`, executable by `authenticated` only): one-dimensional lists, at most 20 filters in all, each trimmed, 1 to 100 characters, unique case-insensitively across both lists. The insert and update grants gain the two columns (seven columns to insert, six to update). The applicant review reads them; CV matching comes later.
- **Applicant review** (applied to Supabase on 2026-10-31 and checked with SQL; [features/applicant-review.md](../features/applicant-review.md), `supabase/migrations/20261031120000_applicant_review.sql`): `job_applications` gains `cv_path` and `cover_letter_path` (object paths in the private Storage bucket `application-documents`, which has no storage policies, so only the secret key reads it), `matched_filters text[]` (null = not checked), and `viewed_at` and `liked_at`, the company's review marks. An update policy on `job_applications` for the job's owner (active applications only) with an update grant on `viewed_at` and `liked_at` only. `public.demo_job_filters()` and `public.demo_applicants()` hold the demo job's filters, documents and matches (not executable by clients); `ensure_employer_workspace()` uses them for new demo jobs, and the migration backfilled the existing one.
- **Company names and slugs** (migration `supabase/migrations/20261109120000_company_slugs.sql`, **written, not applied**; [features/company-slugs.md](../features/company-slugs.md)): `companies.slug` (unique, `company_slug_valid()`: 3 to 40 of `a-z0-9-`, no hyphen at either end, not a reserved word) and a check on `companies.name`; `set_up_company(p_name, p_slug)` (security definer, executable by `authenticated` only) names the caller's company once. The slug is also in `app_metadata.company_slug`, set by the Server Action with the secret key.
- **Company profiles** (migration `supabase/migrations/20261109160000_company_profiles.sql`, applied by hand on 2026-11-09, plus `20261109170000_company_profile_slug_check.sql`, applied through `apply_migration`: it lets `authenticated` run `company_slug_valid()`, which the slug CHECK calls on every update of a company; [features/company-profile.md](../features/company-profile.md)): `companies` gains `description`, `website`, `industry`, `size` (enum `company_size`) and `headquarters`, each with a check; `public_company_profile(p_slug)` (security definer, executable by `anon` and `authenticated`) answers the name, slug and these five columns; `published_job_postings(p_job_id, p_company_slug)` gains the company filter (dropped and made again, since a parameter can't be added with `create or replace`). The owner writes the five columns directly, through a column-level `update` grant and an owner-only policy.
- **Published jobs and applying** (migration `supabase/migrations/20261109130000_published_jobs.sql`, applied by hand; [features/apply-with-cv.md](../features/apply-with-cv.md)): `published_job_postings(p_job_id)` (security definer, executable by `anon` and `authenticated`) answers what a candidate may see of a published job, with no filters; `my_job_application(p_job_id)` answers the caller's own `applied_at`. Candidates still have no write privilege on any table: `applyToJob` inserts with the secret key.
- **CV screening** (migration `supabase/migrations/20261109140000_cv_screening.sql`, applied 2026-11-09 and checked with SQL; [features/cv-screening.md](../features/cv-screening.md)): `job_applications` gains `unverified_filters`, `screening_outcome` (`checked` / `unreadable`), `screened_at` and `screening_engine`, none in any grant (only the secret key writes them), and `save_screening(...)` (security definer, executable by `service_role` only), which writes a result only while the job still has the filters it was made for. The screening runs in `src/lib/screening/`: pdf.js reads the CV's text on the server, a keyword matcher answers met / missing / unverified per filter, behind a `ScreeningEngine` interface so another engine is one line (`src/lib/screening/index.ts`).
- **CVs on the candidate's account** (migration `supabase/migrations/20261109150000_candidate_cvs.sql`, applied 2026-11-09; [features/candidate-cvs.md](../features/candidate-cvs.md)): `candidate_cvs` (`user_id` → `auth.users`, `file_name`, `storage_key`, `size_bytes`; at most 5 a candidate, by a trigger; no client privilege). `job_applications` gains `cv_id` (→ `candidate_cvs`, `no action`, so a CV in use can't be deleted), `cover_letter_text` (up to 5,000) and `withdrawn_by` (`company` / `candidate`), and checks that a withdrawn application holds no documents and that it has one kind of cover letter at most. `storage_deletions` is the queue of R2 keys to delete, filled by triggers on both tables and drained by `src/lib/storage/deletions.ts`. `unpublish_job_posting` is replaced (same signature) to clear the documents of withdrawn applications. The candidate reads through `my_cvs()`, `my_job_applications()` and `my_application_document_path()`, and withdraws with `withdraw_my_application()`.
- **Application status** (applied to Supabase on 2026-11-02 and checked with SQL; [features/application-status.md](../features/application-status.md), `supabase/migrations/20261102120000_application_stages.sql`): `job_applications.stage` (`public.hiring_stage` enum: `APPLIED` / `SCREENING` / `INTERVIEW` / `OFFER` / `HIRED` / `REJECTED`, default `APPLIED`) and `stage_changed_at`. The update grant gains these two columns under the existing update policy. Separate from `applications.status`, the candidate-side tracker, and from `withdrawn_at`.

### `rate_limits` (Phase 1, draft)
Replaces the in-memory rate-limit counters. Likely columns: key (primary key), count, reset_at. It's updated through a single atomic SQL function (upsert + increment) called only from the server with the service role key, never exposed to clients.

## Supabase Setup

Env vars (server-only, validated in `src/lib/env.ts`): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and the four `R2_*` ones for document storage. See `.env.example`.

**Documents are not in Supabase Storage any more** ([features/document-storage.md](../features/document-storage.md)). CVs and cover letters are in a private Cloudflare R2 bucket in the EU jurisdiction, behind `src/lib/storage/r2.ts` (an `aws4fetch` client: `put`, `get`, `delete`) and `src/lib/storage/documents.ts` (the store built from `env`). The old Supabase bucket `application-documents` stays, unused.

| Module | Key | Used for |
|---|---|---|
| `src/lib/supabase/server.ts` | publishable | Server Actions, Route Handlers, DAL (`src/lib/auth/dal.ts`), the Applied Server Action |
| `src/lib/supabase/public.ts` | publishable | `src/lib/jobs/queries.ts`'s cached (`'use cache'`) reads — no cookies, so it can be cached |
| `src/lib/supabase/proxy.ts` | publishable | Session refresh in `src/proxy.ts` |
| `src/lib/supabase/admin.ts` | secret | The `rate_limit_hit` RPC, auth email links, `app_metadata` updates (account type, company slug), the writes of `applyToJob` (the candidate's profile and application), `uploadCv` and `deleteCv`, and the deletion queue |

There is **no browser client**: every auth call goes through a Server Action or Route Handler, so the CSP needs no `connect-src` change. Sessions are stored in persistent `sb-*-auth-token` cookies and refreshed in proxy. The dashboard's job descriptions are fetched client-side, but only from our own same-origin Route Handler (`/api/jobs/descriptions`), which is itself backed by the server-side Supabase client — same reasoning, same `connect-src` non-change.

Migrations live in `supabase/migrations/`. The Supabase MCP server is configured in `.mcp.json`.

## UI Components

shadcn/ui (Base UI primitives) on top of Tailwind v4 for forms (auth), the job table, filter builder and nav headers (`src/components/jobs/`), and the `/applications` table.
