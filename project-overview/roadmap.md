# Callback — Roadmap

Each phase lists what's in scope and what's explicitly deferred, so later phases don't get implied or started early.

## Security Baseline — Done
- Security headers and a static CSP in `next.config.ts`, with `X-Powered-By` removed
- Global rate limit of 300 requests/min per IP in `src/proxy.ts`, with in-memory counters
- Reusable `rateLimit()` / `getClientIp()` helper in `src/lib/rate-limit.ts`

Details and hosting requirements: [security.md](./security.md).

## Phase 1 — Auth Foundation — In Progress
Code done; see [features/auth.md](../features/auth.md). Waiting on Supabase setup for live testing.

**In scope:**
- Create Supabase project, install `@supabase/supabase-js`, add `.env.local` and a `src/lib/supabase` client
- Build `/sign-in`, `/sign-up`, `/forgot-password` pages with shadcn/ui forms
- Wire up session handling and protected-route redirects

**Security work in this phase:**
- Rate limits on auth Server Actions, using `rateLimit()`:
  - sign-in: 5 attempts per 15 min per IP + email
  - sign-up: 3 per hour per IP
  - forgot-password: 3 per hour per email and 10 per hour per IP
- Postgres-backed counter store: `rate_limits` table plus an atomic upsert SQL function, called server-side only, replacing `memoryStore`
- zod validation of every auth Server Action input
- Env-var validation at startup; Supabase service role key never in `NEXT_PUBLIC_*`
- `server-only` on Supabase server client / Data Access Layer modules
- ~~Add the Supabase URL to CSP `connect-src`~~ Not needed: there is no browser Supabase client

**Deferred:** nothing beyond auth itself.

## Landing Page — Done
See [features/landing.md](../features/landing.md). `/` is the landing page; the public job list moved to `/jobs`. Its copy and availability tags were brought up to date with the employer side on 2026-11-09 (publishing and manual review are live; Smart Screening and candidate messages are still "Coming soon").

## Phase 2 — Dashboard — Done
See [features/dashboard.md](../features/dashboard.md).

**In scope:**
- `/` — a public job table (search, a combinable rule-based filter builder, sort, paging) built on the real data from Phase 3
- `/dashboard` — the same table, protected, plus an Applied column/filter backed by a minimal `applications` table
- `work_mode` (`REMOTE` / `HYBRID` / `ON_SITE`) computed by the scraper and published alongside each job

**Deferred:** application notes (Phase 4); OR groups and saved filter presets.

## Phase 3 — Job Data Source
**In scope:**
- Decide how job listings are collected (manual entry, scraping, external API, etc.)
- Integrate chosen source into the `jobs` table and dashboard

**Status:** proposed: a free standalone scraper with JSON output, see [features/job-scraper.md](../features/job-scraper.md). Not implemented.

## Phase 4 — Applications Tracker — In Progress
See [features/applied.md](../features/applied.md).

A minimal `applications` table (`user_id`, `job_id`, `applied_at`) and the Applied checkbox shipped in Phase 2
([features/dashboard.md](../features/dashboard.md)) — entries are created by the user ticking the box, which
answers Phase 5 for this minimal shape.

**In scope:**
- `/applications` page with a shadcn/ui `Table` component, listing the user's applied-to jobs with a Status dropdown
- `status` on `applications` (Pending / Long time no answer / Rejected / Got offer)
- Applying is one-way: the Applied checkbox asks for confirmation, and there is no way to undo it

**Deferred:** `notes` on an application, status history; automated entries from another source (e.g. a browser extension) — still open.

## Employer: Companies & Jobs — In Progress
See [features/companies.md](../features/companies.md).

**Done (first step, no database):** the employer workspace under the company's slug (`/test`), a "Create your first job" dashboard, a job form with a live candidate preview, and jobs posted on Callback listed first and highlighted in the candidate table (a dev-only fixture stands in for them).

**Built, not yet pushed ([features/demo-job.md](../features/demo-job.md)):** every company gets its own row, and a demo job with three mock candidates (real accounts in the database) on its first dashboard visit, which it can delete. The migration is applied and the mock candidates are seeded; what is left is a look at the dashboard in a browser, and the push to `main`.

**Built, migration applied, not yet pushed ([features/post-job.md](../features/post-job.md)):** the job form saves a job (title, description, location, work mode) to `job_postings` and returns to the dashboard; the candidate preview has an Upload CV button that does nothing yet.

**Built, migration applied, not yet pushed ([features/job-publishing.md](../features/job-publishing.md)):** a company can edit any of its jobs, and publish or unpublish them from the dashboard card. A new job is a draft; unpublishing a job with applicants asks whether to withdraw their applications, move them to another job, or keep them. Published jobs are not on the job board yet.

**Built, migration applied, not yet pushed ([features/job-filters.md](../features/job-filters.md)):** the job form takes CV filters, "Required" and "Nice-to-have" chips, stored with the job and never shown to candidates. This only stores them.

**Built, migration applied, checked in a browser, committed, not yet pushed ([features/applicant-review.md](../features/applicant-review.md)):** Lets start opens the applicant review, Fast Manual Mode on real applications: playlist, the original CV and cover letter (PDFs from a private bucket, opened through an access-checked route), a screening overview against the filters, Next (marks viewed) and a heart (likes). Nothing is rejected automatically. The demo job's three applicants have real PDFs and hand-written matches.

**Built, migration applied, checked in a browser, pushed ([features/application-status.md](../features/application-status.md)):** each application has a status on the review screen (Applied, Screening, Interview, Offer, Hired or Rejected), set by click or key, and the playlist can be narrowed by it. The candidate isn't told yet. **Next steps, one at a time (the full order is in that document):** email templates and telling the candidate, then a job's candidates at a glance, then real matching.

**Built, migrations applied, not yet checked in a browser or pushed, five steps in this order:**
1. [features/company-slugs.md](../features/company-slugs.md): the company's name and its own address, `/{slug}`, chosen once on `/setup` (replaces the fixture `/test`).
2. [features/document-storage.md](../features/document-storage.md): CVs and cover letters in Cloudflare R2 instead of Supabase Storage. Done and checked against the real bucket; `PRODUCTION_ENV` needs the four `R2_*` variables before a deploy.
3. [features/apply-with-cv.md](../features/apply-with-cv.md): published jobs on `/jobs`, a page for each, and a candidate applying with a CV and a cover letter (PDF). Replaces the development-only fixture job.

4. [features/cv-screening.md](../features/cv-screening.md): a free keyword check of each applicant's CV against the job's filters, with a `ScreeningEngine` interface so a real ATS can replace it later. pdf.js reads the text on the server, results show on the review screen (met / missing / check by eye), the playlist can be ordered Best match, and applications are checked again when a job's filters change.
5. [features/candidate-cvs.md](../features/candidate-cvs.md): CVs live on the candidate's account (up to 5, on "Your CVs", `/profile`), an application only points to one, and the company reads it only while the application is active. The candidate applies in a dialog, with a typed or a PDF cover letter, comes back to the posting after signing in or signing up, and can withdraw an application on `/applications`. Replaces the upload form of step 3.

The code and its tests are done, and all five migrations are applied (`company_slugs` and `published_jobs` by hand; `cv_screening` and `candidate_cvs` on 2026-11-09, through `apply_migration`). `cv_screening` is checked with SQL; `candidate_cvs` isn't yet, and nothing has been checked in a browser.

**Deferred:** a company name and slugs from accounts; native jobs from the database; a public careers page with branding; the application form and automatic status tracking; CV parsing and matching. The order is in the feature doc.

## Phase 5 — Application Tracking Source
**Status:** manual entry (the Applied checkbox, Phase 2) is decided and shipped. Automated entry
(e.g. derived from Phase 3's job source) is still an open decision, revisit later.
