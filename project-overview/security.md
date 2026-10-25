# Callback — Security

This page covers the security baseline that's in place today, what the hosting setup has to provide, and the rules future code must follow.

## What's In Place

### Security headers (`next.config.ts`)
Applied to every route via `headers()`:

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see below | Restricts where scripts, styles, images, fonts, and forms can load from |
| `Strict-Transport-Security` | `max-age=63072000` (production only) | Forces HTTPS for 2 years after first visit |
| `X-Content-Type-Options` | `nosniff` | Stops browsers from guessing MIME types |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sends only the origin to other sites, nothing over HTTPS→HTTP |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), browsing-topics=()` | Disables browser APIs the app doesn't use |
| `X-Frame-Options` | `DENY` | Legacy clickjacking protection (CSP `frame-ancestors` is the modern equivalent) |

`poweredByHeader: false` removes the `X-Powered-By: Next.js` header.

HSTS deliberately leaves out `includeSubDomains` and `preload`. Add them once the production domain is known and every subdomain serves HTTPS. Preload in particular is effectively irreversible.

### Content Security Policy
```
default-src 'self';
script-src 'self' 'unsafe-inline';          (+ 'unsafe-eval' in development only)
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests                   (production only)
```

**Why it's static and allows `'unsafe-inline'` scripts:** the stricter, nonce-based CSP requires every page to be rendered dynamically, and the Next.js 16 docs state it is incompatible with Partial Prerendering, which `cacheComponents` enables. We chose to keep `cacheComponents`. Until that changes, React's automatic escaping is the main XSS defense, which makes the `dangerouslySetInnerHTML` rule below important.

`'unsafe-eval'` is only added in development because React uses `eval` there for error stack reconstruction.

### Global rate limit (`src/proxy.ts`, `src/lib/rate-limit.ts`)
- Every request except static assets (`_next/static`, `_next/image`, images, favicon) counts toward **300 requests per minute per client IP**.
- Over the limit, the app responds `429 Too Many Requests` with a `Retry-After` header (seconds until the window resets).
- Counters live in memory (`memoryStore`), using a fixed window per key. Expired entries are swept once the map exceeds 10,000 keys.
- `rateLimit()` takes a swappable `store`, so Phase 1 can move counters to Postgres without touching call sites.

### How the client IP is derived
`getClientIp()` uses the **rightmost** entry of `X-Forwarded-For`.

Next.js only sets `X-Forwarded-For` itself when the header is missing, and never appends to it. A reverse proxy configured with `$proxy_add_x_forwarded_for` appends the real client IP as the last entry. Anything to its left was sent by the client and can be forged.

### Auth (Phase 1)
- **No browser Supabase client.** Auth runs only in Server Actions (`src/app/(auth)/actions.ts`) and `src/app/auth/confirm/route.ts`, so our rate limits can't be bypassed and no keys reach the browser.
- Env vars are server-only and validated at startup (`src/lib/env.ts`). The secret key is used only by `src/lib/supabase/admin.ts`.
- Auth limits use `postgresStore` (`src/lib/supabase/rate-limit-store.ts`), backed by `public.rate_limits` and the `rate_limit_hit` function, executable only by `service_role`. It fails closed.

| Action | Limit |
|---|---|
| sign-in | 5 / 15 min per IP + email |
| sign-up | 3 / hour per IP |
| forgot-password | 3 / hour per email and 10 / hour per IP |
| reset-password | 5 / 15 min per user |

- Responses never reveal whether an account exists.
- `/auth/confirm` only redirects to same-origin paths (`next` must start with `/`, not `//` or `/\`).

### Dashboard (Phase 2)
See [features/dashboard.md](../features/dashboard.md).

- **The job list is intentionally public** (`/jobs`, the job count and newest postings on the `/` landing page, and `/api/jobs/descriptions`). `public.jobs` RLS already limited `anon`/`authenticated` to `active` rows (Phase 3's scraper); the dashboard changes nothing about what's exposed, only who can reach it without signing in.
- **`markApplied`** (`src/app/(app)/dashboard/actions.ts`) re-checks `requireUser()`, validates input with zod, and is rate-limited at 60/min per user via `postgresStore`. **`setApplicationStatus`** (`src/app/(app)/applications/actions.ts`) does the same, with its own 60/min limit (key `application-status:<userId>`), and only accepts the four `application_status` values.
- **Applying is irreversible in the database, not just the UI** ([features/applied.md](../features/applied.md)). `public.applications` RLS scopes `select`/`insert`/`update` to `user_id = auth.uid()`, there is no delete policy or grant, and the `update` grant covers the `status` column only, so `job_id`, `user_id` and `applied_at` can't be changed from a client.
- **`setSaved`** (same file) does the same checks as `markApplied`, with its own 60/min limit (key `saved:<userId>`). Saving toggles both ways, so `public.saved_jobs` RLS scopes `select`/`insert`/`delete` to `user_id = auth.uid()`; there is no update policy or grant ([features/saved-jobs.md](../features/saved-jobs.md)).
- **`jobs` has two more select policies** for `authenticated`: a user can read a job they applied to, and a job they saved, even when it is inactive. `anon` still only sees active jobs.
- **Filters decoded from the URL are treated as untrusted input:** zod-validated, capped (20 rules, 20 values/rule, 100 chars/value), and every text value is regex-escaped before being compiled into a `RegExp` — a crafted link can't inject regex syntax or force pathological matching. An invalid or tampered `f` param is dropped silently (loads unfiltered), never thrown.
- **Account types** ([features/account-types.md](../features/account-types.md)).
  - The type lives in `app_metadata`, which users can't edit.
  - Candidate pages and Server Actions call `requireAccountType("candidate")`, and the company pages under `/{company}` call `requireAccountType("employer")`. Proxy's redirects by type are only optimistic.
  - Before activation there is no session. The right to pick a type is the `cb_pending_signup` cookie: encrypted (AES-256-GCM with `AUTH_COOKIE_SECRET`), `httpOnly`, valid for 1 hour, and set only after sign-up created the account or after sign-in proved the password.
  - For emails that already have an account the cookie is a decoy, so sign-up still doesn't reveal accounts.
  - `chooseAccountType` is limited to 10/h per IP and 5/h per email.
  - `public.account_for_email` is executable by `service_role` only.
- **`POST /api/jobs/revalidate`** (`src/app/api/jobs/revalidate/route.ts`) lets the scraper drop the cached job list after `publish`/`boards`.
  - It requires `Authorization: Bearer $REVALIDATE_SECRET`, at least 32 characters, shared with the scraper through `.env.local`. The secret is compared as SHA-256 digests with `timingSafeEqual`.
  - It is rate-limited at 10/min per IP. It returns 404 while `REVALIDATE_SECRET` is unset.
  - All it can do is expire the `jobs` cache tag, so the worst case of abuse is extra Supabase reads.
- No browser Supabase client here either: `/api/jobs/descriptions` is same-origin and itself backed by the server-side `supabasePublic` client (`src/lib/supabase/public.ts`), so the CSP still needs no `connect-src` change.

## Reverse Proxy Requirements

The app assumes it runs as a single Node process on a VPS / Docker host, behind exactly one reverse proxy that terminates TLS. Minimal nginx example:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

- `Host` must be forwarded unchanged. Server Actions reject requests whose `Origin` doesn't match the host, which is the built-in CSRF protection.
- `X-Forwarded-For` must be appended by the proxy, or the rate limit can be bypassed by forging the header.
- If another proxy or CDN (e.g. Cloudflare) is added in front, `getClientIp()` must be updated, because the rightmost entry would then be the CDN's IP.
- Optional: nginx `limit_req` as an outer per-IP limit before requests reach Node.

## Rules for Future Code

- **Re-check auth inside every Server Action and Route Handler.** `proxy.ts` may only read the session cookie for redirects. A matcher change can silently skip it, and Server Actions are public POST endpoints.
- **Validate every input with zod** in Server Actions and Route Handlers before using it.
- **Never use `dangerouslySetInnerHTML` with unsanitized content.** This matters most for job descriptions scraped in Phase 3: sanitize them (e.g. with DOMPurify) or render them as plain text.
- **No secrets in `NEXT_PUBLIC_*` variables.** Those are bundled into client JavaScript. The Supabase service role key must never be prefixed.
- **Data Access Layer modules start with `import 'server-only'`**, so importing them from a Client Component fails the build.
- **Rate limit every expensive or abuse-prone action** with `rateLimit()`, using a key specific to that action (see the Phase 1 limits in [roadmap.md](./roadmap.md)).

## Known Limitations

- The global proxy limit still uses in-memory counters, which reset on restart and aren't shared between processes. Auth limits use the Postgres store.
- Supabase sees our server's IP for every auth call, so its per-IP auth rate limits may need raising for production.
- Inline scripts are allowed by the CSP (see above).
- Without the reverse proxy (e.g. hitting the Node port directly), `X-Forwarded-For` is client-controlled and the per-IP limit can be bypassed. Don't expose the Node port publicly.
- No CAPTCHA on sign-up or forgot-password. We rely on rate limiting plus Supabase Auth's own limits.

## Dependency Audit

- `npm audit --omit=dev`: 0 vulnerabilities (as of 2026-10-21).
- `npm audit` reports 5 high-severity findings in the dev-only `braces` chain pulled in by eslint. They don't ship to production. Don't run `npm audit fix --force`, which would apply breaking downgrades.
