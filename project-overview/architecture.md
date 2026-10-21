# Job Manager — Architecture

## Route Map

| Route | Access | Purpose |
|---|---|---|
| `/sign-in` | Public | Sign in with email/password |
| `/sign-up` | Public | Create a new account |
| `/forgot-password` | Public | Request a password reset |
| `/reset-password` | Authenticated (via recovery link) | Set a new password |
| `/auth/confirm` | Public (Route Handler) | Verifies email links (`token_hash` + `verifyOtp`), then redirects |
| `/dashboard` | Authenticated | Search/browse job listings. Ships as an empty placeholder until a job source is defined. |
| `/applications` | Authenticated | Table of jobs the user applied to. Ships as an empty placeholder until the tracking source is defined. |

## Layout

- Public auth routes (`/sign-in`, `/sign-up`, `/forgot-password`) use a minimal centered-form layout.
- Authenticated routes (`/dashboard`, `/applications`) share a layout with a nav shell exposing both as tabs, plus sign-out.
- Unauthenticated users hitting `/dashboard` or `/applications` redirect to `/sign-in`.

## Request Pipeline

- `next.config.ts` adds security headers and the CSP to every response.
- `src/proxy.ts` (Next.js 16's replacement for `middleware.ts`, always on the Node runtime) applies the global per-IP rate limit. It also refreshes the Supabase session cookies and redirects based on the session, but it must never be the only auth check.
- `src/lib/rate-limit.ts` provides `getClientIp()` and `rateLimit()` with a swappable counter store, reused by auth Server Actions in Phase 1.

See [security.md](./security.md) for details.

## Data Model (Draft — Subject to Change)

Supabase/Postgres tables. Marked draft because `jobs` and `applications` shapes depend on decisions not yet made (job source, tracking source).

### `users`
Managed entirely by Supabase Auth — no custom table needed unless profile fields are added later.

### `jobs` (placeholder, shape TBD)
Will hold job listings once a source is picked. Likely candidate columns: title, company, location, url, posted_at — not finalized.

### `applications` (placeholder, shape TBD)
Will hold the user's applied-to jobs. Likely candidate columns: user_id, job reference, status, applied_at, notes — not finalized.

### `rate_limits` (Phase 1, draft)
Replaces the in-memory rate-limit counters. Likely columns: key (primary key), count, reset_at. It's updated through a single atomic SQL function (upsert + increment) called only from the server with the service role key, never exposed to clients.

## Supabase Setup

Env vars (server-only, validated in `src/lib/env.ts`): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. See `.env.example`.

| Module | Key | Used for |
|---|---|---|
| `src/lib/supabase/server.ts` | publishable | Server Actions, Route Handlers, DAL (`src/lib/auth/dal.ts`) |
| `src/lib/supabase/proxy.ts` | publishable | Session refresh in `src/proxy.ts` |
| `src/lib/supabase/admin.ts` | secret | Only the `rate_limit_hit` RPC |

There is **no browser client**: every auth call goes through a Server Action or Route Handler, so the CSP needs no `connect-src` change. Sessions are stored in persistent `sb-*-auth-token` cookies and refreshed in proxy.

Migrations live in `supabase/migrations/`. The Supabase MCP server is configured in `.mcp.json`.

## UI Components

shadcn/ui on top of Tailwind v4 for forms (auth), tables (applications), and nav shell (authenticated layout).
