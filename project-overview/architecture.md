# Job Manager — Architecture

## Route Map

| Route | Access | Purpose |
|---|---|---|
| `/sign-in` | Public | Sign in with email/password |
| `/sign-up` | Public | Create a new account |
| `/forgot-password` | Public | Request a password reset |
| `/reset-password` | Authenticated (via recovery link) | Set a new password |
| `/auth/confirm` | Public (Route Handler) | Verifies email links (`token_hash` + `verifyOtp`), then redirects |
| `/` | Public | The job list: search, filters, no Applied column. See [features/dashboard.md](../features/dashboard.md). |
| `/dashboard` | Authenticated | Same job list, plus the Applied column and filter. |
| `/api/jobs/descriptions` | Public (Route Handler, `GET`) | Job descriptions, fetched client-side after the table renders. |
| `/applications` | Authenticated | Table of the jobs the user applied to: Label, Company, Applied date and a Status dropdown. Jobs the scraper has taken down stay listed as Expired. See [features/applied.md](../features/applied.md). |

## Layout

- Public auth routes (`/sign-in`, `/sign-up`, `/forgot-password`) use a minimal centered-form layout.
- `/` and `/dashboard` each have their own header (nav links vs. account menu + sign-out) around the same job table.
- A signed-in visitor hitting `/`, or a signed-out visitor hitting `/dashboard` or `/reset-password`, is redirected (`src/proxy.ts`).

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

### `rate_limits` (Phase 1, draft)
Replaces the in-memory rate-limit counters. Likely columns: key (primary key), count, reset_at. It's updated through a single atomic SQL function (upsert + increment) called only from the server with the service role key, never exposed to clients.

## Supabase Setup

Env vars (server-only, validated in `src/lib/env.ts`): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. See `.env.example`.

| Module | Key | Used for |
|---|---|---|
| `src/lib/supabase/server.ts` | publishable | Server Actions, Route Handlers, DAL (`src/lib/auth/dal.ts`), the Applied Server Action |
| `src/lib/supabase/public.ts` | publishable | `src/lib/jobs/queries.ts`'s cached (`'use cache'`) reads — no cookies, so it can be cached |
| `src/lib/supabase/proxy.ts` | publishable | Session refresh in `src/proxy.ts` |
| `src/lib/supabase/admin.ts` | secret | Only the `rate_limit_hit` RPC |

There is **no browser client**: every auth call goes through a Server Action or Route Handler, so the CSP needs no `connect-src` change. Sessions are stored in persistent `sb-*-auth-token` cookies and refreshed in proxy. The dashboard's job descriptions are fetched client-side, but only from our own same-origin Route Handler (`/api/jobs/descriptions`), which is itself backed by the server-side Supabase client — same reasoning, same `connect-src` non-change.

Migrations live in `supabase/migrations/`. The Supabase MCP server is configured in `.mcp.json`.

## UI Components

shadcn/ui (Base UI primitives) on top of Tailwind v4 for forms (auth), the job table, filter builder and nav headers (`src/components/jobs/`), and the `/applications` table.
