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

## Phase 5 — Application Tracking Source
**Status:** manual entry (the Applied checkbox, Phase 2) is decided and shipped. Automated entry
(e.g. derived from Phase 3's job source) is still an open decision, revisit later.
