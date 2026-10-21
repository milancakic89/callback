# Job Manager — Roadmap

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

## Phase 2 — Dashboard Shell
**In scope:**
- Authenticated layout with nav tabs (Dashboard / Applications) and sign-out
- `/dashboard` page with a job search UI skeleton (filters/search bar) and an empty state
- No real job data yet

**Deferred:** actual job data source (Phase 3).

## Phase 3 — Job Data Source
**In scope:**
- Decide how job listings are collected (manual entry, scraping, external API, etc.)
- Integrate chosen source into the `jobs` table and dashboard

**Status:** open decision, revisit later.

## Phase 4 — Applications Tracker
**In scope:**
- `/applications` page with a shadcn/ui `Table` component
- Finalize `applications` schema and wire it to real data

**Deferred:** how entries get created (Phase 5).

## Phase 5 — Application Tracking Source
**In scope:**
- Decide how "where I applied" entries get created: manual entry vs. automated (e.g. derived from Phase 3's job source)

**Status:** open decision, revisit later.
