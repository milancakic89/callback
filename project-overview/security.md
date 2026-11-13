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

### Interview invitations ([features/interview-invitations.md](../features/interview-invitations.md))
- **The company's Google refresh token is encrypted** (AES-256-GCM, a key derived from `GOOGLE_TOKEN_KEY`) in `google_calendar_connections`, a table with RLS on, no policy and no grant: only the secret-key client reads it, after the server has found the caller's own company. The only scope is `calendar.events`, plus `openid email` to show which account is connected. Disconnecting asks Google to revoke the token and deletes the row.
- **The OAuth `state` is a random value in an `httpOnly`, `sameSite=lax` cookie** limited to `/api/google`, checked in constant time when Google sends the employer back. The connect link is a plain `<a>`, because the CSP's `form-action 'self'` blocks a form that ends at Google. Redirects are built from `APP_URL`, as in `/auth/confirm`.
- **The candidate answers with a token in the email's link.** 256 random bits; only their sha-256 is stored, compared in constant time. A wrong id or token is a 404 that says nothing about which invitations exist. The page sets `noindex` and `referrer: no-referrer`.
- **Confirm and Decline are a POST from the page's form, never the link.** Mail scanners (Outlook Safe Links, Gmail) open links in an email; an answer on a GET would be given by the scanner. The answer is one conditional update (still `pending`, before its deadline), so two answers, or an answer racing the expiry job, can't both win.
- **Limits:** 30 invitations an hour per company user, 30 answers per 15 minutes per IP and 10 per invitation, 20 per 15 minutes for a signed-in candidate, 30 cancellations a minute.
- **What users type is escaped in the emails** (the job title, the company's and the candidate's names, the message): `escapeHtml()` in `src/lib/mail.ts`. The message is plain text on the pages too.
- **`/api/interviews/expire` answers 404 without `CRON_SECRET`,** which is compared in constant time, and doesn't exist while the secret is unset.

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
- **Employer jobs and the mock candidates** ([features/demo-job.md](../features/demo-job.md)).
  - `companies`, `candidate_profiles`, `job_postings` and `job_applications` have row level security on and every privilege revoked from `anon` and `authenticated`. `authenticated` gets `select` on all four, `delete` on `job_postings`, and `insert` on five columns of `job_postings` (`company_id`, `title`, `description`, `location_raw`, `work_mode`): a client can't update anything, and can't insert anywhere else.
  - A company's rows are the ones whose company it owns (`owner_id = auth.uid()`). It reads the profile of a candidate only through an application to one of its jobs. The chain of policies (profiles → applications → jobs → companies) has no cycle.
  - **`ensure_employer_workspace()`** is `security definer` with `search_path = ''`, executable by `authenticated` only, and refuses any JWT whose `app_metadata.account_type` isn't `employer` (which users can't edit).
  - **`deleteJobPosting`** (`src/app/(employer)/[company]/actions.ts`) validates the id as a uuid, re-checks `requireAccountType("employer")`, is limited to 30/min per user (key `delete-job:<userId>`), and deletes through the user's own client, so row level security answers "Job not found" for another company's job.
  - **`createJobPosting`** ([features/post-job.md](../features/post-job.md)) validates the form with zod, re-checks `requireAccountType("employer")`, is limited to 20/h per user (key `create-job:<userId>`), and takes the company id from `ensure_employer_workspace()`, never from the form. The insert policy only accepts a row for the caller's own company and with `is_demo = false`, the column grant leaves out `is_demo`, `id` and `created_at`, and check constraints repeat the length limits in the database.
  - **Editing and publishing** ([features/job-publishing.md](../features/job-publishing.md); applied to Supabase on 2026-10-30 and checked with SQL):
    - `updateJobPosting` validates the id (a uuid from a hidden input) and the fields with zod, re-checks `requireAccountType("employer")`, is limited to 60/h per user (key `edit-job:<userId>`), and updates through the user's own client. The update policy matches only the caller's own, non-demo jobs, so any other id changes no row and answers "Job not found."; the column grant leaves out `published_at`, `is_demo`, `company_id` and `id`.
    - `publishJobPosting` and `unpublishJobPosting` validate their input (uuids; `move` needs a different target), re-check the account type, and share a limit of 30/min per user (key `publish-job:<userId>`). They call the RPCs `publish_job_posting` and `unpublish_job_posting`, which are `security definer` with `search_path = ''`, executable by `authenticated` only, refuse any JWT that isn't an employer's, find the job through the caller's own company, refuse the demo job, and for a move only accept another non-demo job of the same company. The unpublish RPC changes the job and its applications in one transaction. Expect two more "Signed-In Users Can Execute SECURITY DEFINER Function" advisor warnings, by design, like `ensure_employer_workspace()`.
  - **CV filters** ([features/job-filters.md](../features/job-filters.md); applied to Supabase on 2026-10-30 and checked with SQL, including that the check constraint refuses each bad case): `job_postings.required_filters` and `optional_filters` are **private to the company**. The candidate preview doesn't show them, and **any candidate-facing read of `job_postings` must leave these two columns out** (select the columns it needs; never `select *`): visible filters would just be copied into CVs as keywords. They are written with the job, so the same insert and update policies apply (own company, not the demo job), and the column grants gain only these two columns. The form's limits are repeated in the database by the check constraint `job_postings_filters_valid`, which calls `public.job_filters_valid()` (`immutable`, `search_path = ''`, executable by `authenticated` only; it reads nothing). `createJobPosting` and `updateJobPosting` take the lists from repeated form entries and validate them with the same zod schema as the other fields.
  - **Applicant documents and review marks** ([features/applicant-review.md](../features/applicant-review.md); applied to Supabase on 2026-10-31 and checked with SQL as a real employer, in a rolled-back block):
    - CVs and cover letters are in a **private Cloudflare R2 bucket in the EU jurisdiction** ([features/document-storage.md](../features/document-storage.md)), reachable only with the server's key (`R2_*` variables, an API token with Object Read & Write on that bucket only). The browser never gets an address in it: nothing is signed or public, and the CSP is unchanged. PDF only, 5 MB a file. (They were in the Supabase bucket `application-documents` before; it has no storage policies and is now unused.)
    - The only way to an application's file is `GET /api/applications/{id}/documents/{cv|cover-letter}` (and, for a candidate's own CV, `/api/cvs/{id}`, below). It validates the id (uuid) and kind, refuses an employer's request whose `Sec-Fetch-Dest` isn't `empty` (a tab, an iframe, an `<object>` or `<embed>`: the browser's own viewer, with its download button, never opens a file), needs a session (401 without one; a candidate gets only their own active application's documents, through `my_application_document_path()`, and may open them in a tab), is limited to 240/min per user (key `review-doc:<userId>`), and finds the application **with the user's own client** (`withdrawn_at is null`), so row level security decides; only then does the secret-key client read the file. Every refusal past the session check is the same 404. Answers are `private, no-store`. This discourages saving a candidate's file; it can't stop the developer tools, and the product must not promise more than "the company loses access".
    - Storage paths never reach the browser: `getJobApplicants()` answers file names only.
  - **CV screening** ([features/cv-screening.md](../features/cv-screening.md); applied to Supabase on 2026-11-09 and checked with SQL as a real employer, in a rolled-back block): the check reads the CV on the server and keeps **only the verdicts** (which filters were found), never the CV's text. The job's filters are read with the secret key inside `applyToJob` and `rescreenJob` and go no further: not into the action's result, not to a candidate. The four new columns of `job_applications` are in no grant, so clients can't write them (nor read them, as a candidate can't read the table at all), and `save_screening()` is `security definer`, `search_path = ''` and executable by `service_role` only. Reading is bounded: a file is at most 5 MB (the upload limit), 10 pages and 5 seconds, and a file pdf.js can't read is marked unreadable, not thrown. Nothing is rejected, hidden or decided by the result; the screen says it is a keyword check.
  - **Company names and slugs** ([features/company-slugs.md](../features/company-slugs.md); migration applied by hand on 2026-11-09; the table, grants, policy and function rights are checked with read-only queries, and the functions as real users (employer, another employer, candidate, `anon`) through their JWTs against a throwaway account: every refusal listed here held): `set_up_company()` is `security definer` with `search_path = ''`, executable by `authenticated` only, and refuses any JWT whose `app_metadata.account_type` isn't `employer`. `setUpCompany` validates with zod, re-checks `requireAccountType("employer")`, is limited to 10/h per user (key `set-up-company:<userId>`), and writes the slug into `app_metadata.company_slug` with the secret key, so a user cannot pick their own. The slug is fixed once saved (clients have no update privilege on `companies`; the RPC refuses a company that has one). Proxy and `homeFor` read it from the JWT; every company page re-checks with the user's own client, and row level security shows an owner only their own company.
  - **Company profiles** ([features/company-profile.md](../features/company-profile.md); applied by hand on 2026-11-09 and checked with SQL as real users in a rolled-back block, with the follow-up grant `20261109170000_company_profile_slug_check.sql` applied through `apply_migration`; also driven through in a browser as an employer, a candidate and a guest): clients can write exactly five columns of `companies` (`description`, `website`, `industry`, `size`, `headquarters`), through a column-level `update` grant and a policy that only lets an owner touch their own row, so the name, the slug, the owner and the demo flag stay out of reach. `saveCompanyProfile` validates with zod, re-checks `requireAccountType("employer")`, is limited to 30/h per user (key `company-profile:<userId>`) and takes the company from the session's slug, never from the form. The website goes into an `href`, so only an `http(s)` address with no name or password in it is accepted, by zod and by a check constraint, and the link carries `rel="noopener noreferrer nofollow ugc"`. Descriptions are plain text. `public_company_profile()` is `security definer`, readable by `anon`, and answers no id and no owner; `toCompanyProfile()` maps field by field. The follow-up grants `authenticated` EXECUTE on `company_slug_valid()`: it is pure, reads no table and only says whether a slug is acceptable, and the slug CHECK needs it when an owner updates their row.
  - **Published jobs and applying** ([features/apply-with-cv.md](../features/apply-with-cv.md); applied to Supabase by hand):
    - `published_job_postings()` is `security definer`, readable by `anon`, and returns no CV filters, no `is_demo` and no counts: the filters stay private to the company ([features/job-filters.md](../features/job-filters.md)), and `toPublishedJob()` maps field by field, so a column added to the function by mistake cannot reach a page. `my_job_application()` answers only about the caller.
    - **Candidates never write to a table.** `applyToJob` validates with zod (the files too: 1 byte to 5 MB, and the content must start with `%PDF-`; the type the browser sends isn't trusted), re-checks `requireAccountType("candidate")`, is limited to 10/h per candidate (key `apply:<userId>`), checks the job is open and not already applied to, and only then uploads and inserts with the secret key. The file paths and the candidate id come from the server, never the form; a failed insert deletes the uploaded files. File names are cleaned (`cleanDocumentName`) before they become part of a storage key.
    - Server Action bodies are raised to 6 MB for one file (a CV to the account, or a cover letter); the actions themselves still refuse anything over 5 MB.
    - `signIn` follows a `next` only when it is `/jobs/<uuid>` (optionally `?apply=1`, nothing else) and the account is a candidate. `signUp` keeps the same, checked again, in the encrypted pending-signup cookie, and only a candidate's activation link uses it; `/auth/confirm` still checks it with `safeNext`.
  - **CVs on the candidate's account** ([features/candidate-cvs.md](../features/candidate-cvs.md); applied to Supabase on 2026-11-09, **not yet checked with SQL as real users**):
    - **The candidate's CVs are theirs, not the company's.** `candidate_cvs` (up to 5 a candidate, enforced by a trigger under an advisory lock, `54000`; 5 MB each, a check) has row level security on and no privilege for `anon` or `authenticated`: `uploadCv` and `deleteCv` write with the secret key, by `id` **and** `user_id`, and the candidate reads through `my_cvs()`, which gives no storage keys. A CV's key is `candidates/{userId}/cvs/{cvId}/{cleaned name}`, made on the server.
    - **An active application holds documents, a withdrawn one holds none**, enforced by a check constraint. Withdrawing, by the company (`unpublish_job_posting`) or the candidate (`withdraw_my_application()`, only their own active application), clears `cv_id`, `cv_path`, `cover_letter_path` and `cover_letter_text` in the same update, which ends the company's access (the document route reads only active applications) and unlocks the CV. While an application is active, the foreign key refuses to delete its CV (`23503`), so a candidate can't pull a CV out from under a company that is reading it; withdrawing is the way out.
    - **Files are deleted through a queue.** Triggers put the keys a row lets go of in `storage_deletions` (service role only); never `mock/…` (the demo PDFs) and never a candidate's CV from an application. `drainStorageDeletions()` deletes them from R2 after the response of every action that withdraws or deletes; a failed delete stays queued.
    - **A candidate opens only their own files:** `/api/cvs/{id}` (by id and owner, secret key) and their own application's documents through `my_application_document_path()`, both in a tab. The employer's way to a document is unchanged.
    - `applyToJob` takes a CV id and looks it up by id **and** owner before anything is saved; another candidate's CV is "no longer on your account". A typed cover letter is plain text up to 5,000 characters (a check), shown as text, never HTML; an application has a text or a PDF one, never both (a check). The trigger functions are `security definer` with an empty `search_path` and not executable by any client.
    - `markApplicationViewed` and `setApplicationLiked` validate the id (uuid), re-check `requireAccountType("employer")`, share a limit of 120/min per user (key `review-mark:<userId>`), and update through the user's own client. The update policy matches only active applications to the caller's own jobs, and the column grant is `viewed_at` and `liked_at` only (checked: `matched_filters`, `cv_path` and `withdrawn_at` are refused; another employer and a withdrawn application change 0 rows).
    - `public.demo_job_filters()` and `public.demo_applicants()` are not executable by `anon` or `authenticated`.
  - **Application status** ([features/application-status.md](../features/application-status.md); applied to Supabase on 2026-11-02 and checked with SQL as a real employer, in a rolled-back block): `setApplicationStage` validates the status against `HIRING_STAGES` with zod, then goes the same way as the review marks: a uuid, `requireAccountType("employer")`, the shared 120/min (key `review-mark:<userId>`), and an update through the user's own client. The existing update policy limits it to active applications to the caller's own jobs, and the column grant gains only `stage` and `stage_changed_at` (checked: every other column is refused; another employer, a stranger and a withdrawn application change 0 rows; `anon` is refused). Rejecting doesn't end access to the documents yet; that comes when the candidate is told.
  - **Candidate steps** ([features/candidate-steps.md](../features/candidate-steps.md); migration applied by hand on 2026-11-09; the table, grants, policy and function rights are checked with read-only queries, the functions' behaviour as real users is not yet): `setApplicationStage` now takes `{ stage, stepId }`, validated with zod (a step names which one, and nothing else does) and written as `pipeline_stage`, `step_id` and `stage_changed_at` through the user's own client, on the same shared 120/min; a trigger refuses a step that isn't the job's company's. `applyApplicationStages` (30/min, key `apply-stages:<userId>`, at most 500 changes) and `saveCandidateSteps` (30 an hour, key `candidate-steps:<userId>`) go through security-definer RPCs that find the company from the caller (`auth.uid()`), never from the request. The `candidate_*` columns have no update grant: only `apply_application_stages` writes them, and only for an application that still stands where the employer saw it. A candidate reads only what the company applied (`my_job_applications`), never the employer's pending choice. The company's step text is plain text, shown by React as text and never as HTML.
  - **The mock candidates are real accounts, made unable to sign in:** `app_metadata.mock = true`, a random password nobody sees, `email_confirm`, and a 100-year ban. Their addresses are on `example.com`. The seed script refuses to touch an account at one of those addresses that isn't marked `mock`.
- **`POST /api/jobs/revalidate`** (`src/app/api/jobs/revalidate/route.ts`) lets the scraper drop the cached job list after `publish`/`boards`.
  - It requires `Authorization: Bearer $REVALIDATE_SECRET`, at least 32 characters, shared with the scraper through `.env.local`. The secret is compared as SHA-256 digests with `timingSafeEqual`.
  - It is rate-limited at 10/min per IP. It returns 404 while `REVALIDATE_SECRET` is unset.
  - All it can do is expire the `jobs` cache tag, so the worst case of abuse is extra Supabase reads.
- No browser Supabase client here either: `/api/jobs/descriptions` is same-origin and itself backed by the server-side `supabasePublic` client (`src/lib/supabase/public.ts`), so the CSP still needs no `connect-src` change.

## Reverse Proxy Requirements

The app assumes it runs as a single Node process on a VPS / Docker host, behind exactly one reverse proxy that terminates TLS. Production uses Caddy (`deploy/Caddyfile`, see [deployment.md](./deployment.md)), which keeps `Host` and sets `X-Forwarded-For` to the client's address. A minimal nginx equivalent:

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
