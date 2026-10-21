# Feature: Authentication (Phase 1)

**Status:** Code implemented. Live testing waits for `.env.local`, the manual Supabase setup below and the migration.

Sessions live in persistent `@supabase/ssr` cookies (400-day `maxAge`) and are refreshed in proxy, so a page refresh or browser restart keeps the user signed in until they sign out or the refresh token expires.

## Context

Phase 1 of [roadmap.md](../project-overview/roadmap.md) covers email/password auth on Supabase: sign in, sign up, forgot password, plus the security work that roadmap assigns to this phase. It builds on the security baseline that is already in place:
- headers and a static CSP in `next.config.ts`
- a global 300/min limit in `src/proxy.ts`
- `rateLimit()` / `getClientIp()` / `memoryStore` in `src/lib/rate-limit.ts`

### Decisions
- Supabase Cloud.
- Email confirmation is required before the first sign-in.
- Email + password only, no OAuth.
- Native `<form action>` + Server Actions + `useActionState`, with zod validation on the server and shadcn/ui inputs.
- Passwords need at least 8 characters, enforced in zod and in Supabase settings.
- After sign-in, a placeholder `/dashboard` shows the user's email and a sign-out button. Phase 2 replaces it.
- The built-in Supabase mailer is used for development. A custom SMTP provider is required before production.

### Constraints from the Next.js 16 docs
See `node_modules/next/dist/docs/01-app/02-guides/authentication*.md`.
- With `cacheComponents`, reading `cookies()` outside `<Suspense>` is a **build error**. Session reads go in components wrapped in Suspense, not at the top of layouts.
- Proxy should only do optimistic checks. Every Server Action, page and DAL call must re-check auth.
- `redirect()` in a Server Action must be called outside `try`. A `redirect()` mid-stream turns into a client-side meta refresh, so HTTP redirects for auth gating belong in proxy.

### Key design choices
- **No browser Supabase client.** All auth calls go through Server Actions or a Route Handler. Benefits:
  - Our rate limits can't be skipped through the app.
  - Env vars need no `NEXT_PUBLIC_` prefix.
  - The CSP needs **no** `connect-src` change.
- **The session refresh happens in proxy.** Server Components can't write cookies. If the token were refreshed during a render, the rotated refresh token would be lost and the user logged out. The proxy runs the refresh only when an `sb-*-auth-token` cookie exists, using `getClaims()`. That call is a local JWT check, and it only hits the network when the access token has expired.
- **Email links use the `token_hash` flow** (`/auth/confirm` + `verifyOtp`), not PKCE `?code=`, so links still work when opened on another device or browser.

## Implementation Steps

### 1. Dependencies & UI setup
- Install `@supabase/ssr` and `@supabase/supabase-js`, plus `zod` (v4).
- shadcn/ui: run `npx shadcn@latest init` (check `--help` for non-interactive flags first), then `npx shadcn@latest add button input label card alert`. This creates `components.json`, `src/lib/utils.ts` and `src/components/ui/*`, and rewrites the theme in `src/app/globals.css`.
- In `src/app/layout.tsx`, change the metadata title to "Job Manager".
- Add `!.env.example` to `.gitignore`. Add `.env.example` with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`.

### 2. Server-side foundations
All of these modules start with `import 'server-only'`, except the proxy helper.
- `src/lib/env.ts`: a zod schema that parses `process.env`. Malformed or missing variables fail fast with a clear message.
- `src/lib/supabase/server.ts`: `createClient()` uses `createServerClient` with `await cookies()` `getAll`/`setAll`. `setAll` is wrapped in try/catch, because Server Components can't set cookies and proxy handles refresh.
- `src/lib/supabase/admin.ts`: a client built with `SUPABASE_SECRET_KEY` and `persistSession: false`. It is used **only** for the rate-limit RPC.
- `src/lib/supabase/proxy.ts`: `updateSession(request)` builds a server client on request/response cookies (the `@supabase/ssr` Next pattern), calls `auth.getClaims()`, and returns `{ response, isAuthenticated }`. It doesn't import `server-only`, so proxy can import it. If the build complains about `env.ts` in proxy, read the two variables directly there.
- `src/lib/supabase/rate-limit-store.ts`: `postgresStore: RateLimitStore`. It calls RPC `rate_limit_hit(p_key, p_window_ms)` through the admin client and throws if the RPC fails (fail closed). It is kept out of `src/lib/rate-limit.ts` so the secret-key client never enters proxy's import graph.
- `src/lib/auth/dal.ts`:
  - `getCurrentUser = cache(async () => …)` uses React `cache`, reads `getClaims()`, and returns `{ id, email } | null`.
  - `requireUser()` calls `redirect('/sign-in')` when there is no user.
- `src/lib/auth/schemas.ts`: zod schemas for sign-in, sign-up (email, password min 8, confirmPassword must match), forgot-password and reset-password.

### 3. Database migration
`supabase/migrations/<timestamp>_rate_limits.sql`, run in the Supabase SQL editor. It creates:
- table `public.rate_limits(key text primary key, count int not null, reset_at timestamptz not null)` with RLS enabled and no policies
- function `public.rate_limit_hit(p_key text, p_window_ms int)`, a single atomic `insert … on conflict do update` that resets the counter once `reset_at` has passed and returns `count, reset_at`
- `revoke execute … from public, anon, authenticated` and `grant execute … to service_role`, so clients can't call it to exhaust someone else's limit

### 4. Server Actions — `src/app/(auth)/actions.ts` (`'use server'`)
Every action follows the same order:
1. Parse the input with zod.
2. Apply `rateLimit({ store: postgresStore })`, keyed by `getClientIp(await headers())` and/or the lowercased email.
3. Call Supabase.
4. Return a generic, non-enumerating state `{ error?, message?, fieldErrors?, email? }`, or `redirect()` outside try.

| Action | Limits | Behavior |
|---|---|---|
| `signIn` | 5 / 15 min per IP+email | `signInWithPassword`. The error is "Invalid email or password". `email_not_confirmed` returns "Confirm your email first". Success redirects to `/dashboard`. |
| `signUp` | 3 / hour per IP | `signUp`. The response is always "Check your email to confirm your account", because Supabase hides existing accounts when confirmation is on. A leaked/weak password shows its message. |
| `forgotPassword` | 3 / hour per email **and** 10 / hour per IP | `resetPasswordForEmail`. The response is always "If an account exists, we've sent a reset link". The IP limit stops attackers from burning the project-wide email quota. |
| `resetPassword` | 5 / 15 min per user | `requireUser()`, then `updateUser({ password })`, then redirect to `/dashboard`. |
| `signOut` | — | `auth.signOut()`, then redirect to `/sign-in`. |

### 5. Routes & UI
- `src/app/(auth)/layout.tsx`: centered layout. No session read, so it stays static.
- `(auth)/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`: each `page.tsx` is a static Server Component that renders a `'use client'` form.
  - The form uses `useActionState(action, initialState)` and shadcn `Card`/`Input`/`Label`/`Button`/`Alert`.
  - The submit button is disabled while the action is pending.
  - Inputs have native `required`, `type=email` and `minLength=8`, and keep the email after an error.
  - Pages link to each other.
  - Sign-in shows a message from `?error=invalid_link` or `?reset=done` via `searchParams`, inside the client form, so the page shell stays static.
- `src/app/auth/confirm/route.ts`: `GET` reads `token_hash`, `type` and `next`, then calls `verifyOtp({ type, token_hash })`.
  - On success it redirects to a **sanitized** `next`: it must start with `/` and not with `//` or `/\`; the default is `/dashboard`.
  - On failure it redirects to `/sign-in?error=invalid_link`.
- `src/app/dashboard/page.tsx`: a static shell plus `<Suspense>` around `<CurrentUser/>`. That component calls `requireUser()` and renders the email and a sign-out `<form action={signOut}>`.
- `src/app/page.tsx`: delete it, and add `redirects()` in `next.config.ts` mapping `/` to `/dashboard` (`permanent: false`).

### 6. Proxy — extend `src/proxy.ts`
Order of work:
1. The existing global rate limit.
2. If there is an `sb-…-auth-token` cookie, run `updateSession` (which refreshes cookies).
3. Optimistic gating:
   - No session on `/dashboard*` or `/reset-password` redirects to `/sign-in`.
   - A session on `/sign-in`, `/sign-up` or `/forgot-password` redirects to `/dashboard`.
4. Return `updateSession`'s response so refreshed cookies reach the browser. Redirect responses copy those cookies too.

The matcher is unchanged.

### 7. Docs
- `project-overview/roadmap.md`:
  - Mark Phase 1 as in progress.
  - Replace "add Supabase URL to CSP `connect-src`" with "not needed: no browser client".
  - Add the IP limit on forgot-password.
- `architecture.md`:
  - Add `/reset-password` and `/auth/confirm` to the route map.
  - Add the Supabase client layout (server, admin, proxy) and note that there's no browser client.
- `security.md`: add the auth limits, the `postgresStore`, the server-only env vars and the no-browser-client rationale. Note that Supabase sees our server IP for all users, so its per-IP auth limits may need raising for production.
- `overview.md`: link to `features/`.

## Manual Supabase Setup
Done by the project owner in the Supabase dashboard before end-to-end testing:
1. Create a Cloud project. Copy the Project URL, the publishable key and the secret key into `.env.local`.
2. Under Auth → URL Configuration, set Site URL to `http://localhost:3000` and Redirect URLs to `http://localhost:3000/**`.
3. Under Auth → Providers → Email:
   - Turn Confirm email on.
   - Set minimum password length to 8.
   - Turn on leaked-password protection if your plan has it.
4. Under Auth → Email Templates:
   - Confirm signup link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`
   - Reset password link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
5. Run the migration SQL in the SQL editor.
6. Development email uses the built-in mailer, which allows few messages per hour and likely only reaches team-member addresses. A custom SMTP provider is required before production.

All code can be written first. Live testing waits for `.env.local` and the steps above.

## Verification
1. `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. The build output shows the auth pages as static or partial, with no "cookies outside Suspense" error.
2. In a browser on `npm run dev`, with credentials configured:
   - **Sign-up:** the "check your email" message appears and the email arrives. The link goes through `/auth/confirm` to `/dashboard`, which shows the email.
   - **Sign-out and sign-in:** sign-out lands on `/sign-in`. A wrong password shows the generic error, and a correct one goes to `/dashboard`.
   - **Forgot password:** the generic message appears and the email arrives. The link goes to `/reset-password`, the new password is saved, and signing in with it works.
   - **Rate limits:** the 6th wrong sign-in within 15 minutes shows a "too many attempts" message, and a row exists in `rate_limits`.
   - **Gating:** logged out, `/dashboard` and `/reset-password` redirect to `/sign-in`. Logged in, `/sign-in` redirects to `/dashboard`.
   - **Tampered or expired link:** opening `/auth/confirm` with one redirects to `/sign-in?error=invalid_link`. `next=//evil.com` is ignored.
   - **CSP:** the devtools console shows no violations.
3. Checks that don't need a browser can run with curl: redirect statuses, `/auth/confirm` failures, and the RPC grants via the admin client.
