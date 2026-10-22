# Feature: Jobs Dashboard (Phase 2)

**Status:** Plan only. Not implemented.

One table of active jobs with a live search box and a rule-based filter builder above it. All active jobs are loaded once, and search and filtering run entirely in the browser.

## Context

Phase 2 of [roadmap.md](../project-overview/roadmap.md) planned a dashboard shell with no data. The [job scraper](./job-scraper.md) (Phase 3) already publishes active jobs to `public.jobs`, so the dashboard ships with real data instead of an empty state. It also takes a minimal slice of Phase 4: an `applied` flag per user.

### Decisions
- **The public list lives at `/`, and `/dashboard` shows the same list plus an Applied column.**
  - Signed-out visitors get the table, search and filters on `/`.
  - `/dashboard` stays protected. Signed-in users see the same table plus the Applied column and the Applied filter.
  - The Applied column doesn't exist at all for signed-out visitors: it is neither hidden nor disabled.
- **Columns:** Label (the job title, linking to the posting), Company, Posted, Work mode, Applied (signed in only).
- **Work mode is a single nullable enum, `work_mode`, with values `REMOTE`, `HYBRID` and `ON_SITE`.** The scraper computes it. The table shows it in one column as a badge, or `—` when it's unknown.
- **Applied is a checkbox that saves immediately.** It is backed by a minimal `applications` table (`user_id`, `job_id`, `applied_at`). Phase 4 adds status and notes.
- **Search** is live with no debounce: it matches substrings of title + company.
- **Filters are a list of rules.** A "+ Add filter" button adds a rule of the form `field · operator · values`.
  - All rules must match (AND).
  - One rule can hold several values, which combine according to its operator (any / all / none).
  - The same field can appear in more than one rule.
- **Text in filter rules matches whole words**, ignoring case and diacritics.
- **Descriptions load after the table**, from a separate request, so the first render doesn't wait for 3.8 MB of text.
- **Filter state lives in the URL**, so a filtered view survives a reload and can be shared.

### The data (2026-10-22)

| | Count / size |
|---|---|
| Active jobs | 1283 from 264 companies |
| List payload without descriptions | 385 KB (58 KB gzip) |
| Descriptions | 1023 jobs have one (80%): 3.9 MB (857 KB gzip), average ~3,000 characters, max 15,000 |
| `posted_at` missing | 975 (76%) |
| Location missing | 557 |

### Constraints from the Next.js 16 docs
- **With `cacheComponents`, cached results become part of the static shell** (`01-getting-started/08-caching.md`, "Prerendering").
  - Passing a cached descriptions promise from the page to a Client Component would put the whole 3.9 MB into the prerendered payload, which is "all at once" again.
  - Descriptions therefore come from their own `GET` Route Handler, which the browser calls after hydration.
- **Cached `GET` Route Handlers prerender like pages** (`01-getting-started/15-route-handlers.md`, "With Cache Components"). A handler whose DB read is wrapped in `'use cache'` is served from the cache, not queried on every request.
- **`'use cache'` can't read `cookies()`.** The public read path needs a Supabase client that has no session.
- **`useSearchParams` in a prerendered route client-renders everything up to the nearest `<Suspense>`** (`03-api-reference/04-functions/use-search-params.md`). The explorer is wrapped in `<Suspense>`, and its fallback is the server-rendered, unfiltered first page of the table, so the static HTML isn't empty.
- **`window.history.replaceState` stays in sync with `useSearchParams`** (`02-guides/single-page-applications.md`). URL updates cause no navigation and no server round-trip.
- **Reading `cookies()` outside `<Suspense>` is a build error.** The per-user part of `/dashboard` (user, applied IDs) stays inside Suspense, following the pattern already in `src/app/dashboard/page.tsx`.

### Key design choices
- **There is still no browser Supabase client.**
  - Descriptions come from our own Route Handler, and the Applied toggle is a Server Action.
  - Same-origin `fetch` is already allowed by `default-src 'self'`, so the CSP doesn't change.
- **Supabase returns at most 1000 rows per request by default.** There are already 1283 jobs, so both list queries page through the results with `.range()` in chunks of 1000.
- **Work mode is computed in `publish`, not in `finalize`.**
  - The `descriptions` stage backfills descriptions after `finalize`, so only `publish` sees the final text.
  - The value is derived and not stored in `jobs.json`.
- **The filter engine is a pure, client-safe module.**
  - Each job's text is normalized once.
  - Each rule is compiled to a predicate once per change, not once per row.
  - Search and rules go through `useDeferredValue`, so typing stays responsive without a debounce.
- **No TanStack Table.** The filtering is custom, and sorting and paging take only a few lines. The shadcn `table` markup component is enough.

## Filter model

### Fields and operators

| Field | Type | Operators | Notes |
|---|---|---|---|
| Title | text | contains any of · contains all of · contains none of | |
| Company | text | same as Title | |
| Description | text, lazy | same + is empty · is not empty | Waits until descriptions arrive |
| Location | text | same as Description | Missing for 557 jobs |
| Department | text | same as Description | |
| Work mode | enum | is any of · is none of · is unknown | Multi-select of Remote / Hybrid / On-site |
| Posted | date | in the last N days · before · after | Uses `posted_at ?? first_seen_at` |
| Applied | boolean | is applied · is not applied | `/dashboard` only. An Applied rule in a URL opened on `/` is ignored |

The example from the request becomes three rules:

```
Title        contains any of   [frontend]
Description  contains none of  [react]
Description  contains any of   [vue]
```

### Matching
- **Normalization** is applied to both the job text and the typed value:
  - lowercase
  - diacritics removed: `NFD`, then combining marks stripped, so `č`, `ć`, `š` and `ž` lose their marks
  - `đ` replaced with `dj`, because NFD doesn't decompose it
  - hyphens removed, so `front-end` matches `frontend`
  - runs of whitespace collapsed to one space
- **Whole word** means the value is bounded on both sides by a character that is not a Unicode letter or digit (lookbehind/lookahead, not `\b`). So:
  - `java` doesn't match `JavaScript`
  - `react` matches `React.js` but not `ReactJS`
  - `cacak` matches `Čačak`
  - `C++`, `C#`, `.NET` and `Node.js` work as values
- Values are regex-escaped before compiling. A value with several words matches as a phrase.
- **Missing text** (no location, no description) fails `contains any/all of` and passes `contains none of`. Adding a `Description is not empty` rule excludes those jobs.
- **A rule with no values is inactive.** It is shown dimmed and ignored until it gets a value.
- **Search** is separate from the rules. It matches substrings of title + company, and with several words each word must appear, in any order.

### Description loading
- Visiting the page starts `fetch("/api/jobs/descriptions")` in the background.
- Until the descriptions arrive:
  - Rules on other fields work normally.
  - If any active rule uses Description, the table body shows a loading skeleton and the count shows `…`. Partial results are never shown, because they would be wrong.
  - The Description rule shows a small spinner.
- If the request fails, the rule shows an error with a retry button, and the other rules keep working.

### URL format
- The URL looks like `?q=<search>&f=<filters>&sort=posted.desc`.
- `f` is base64url-encoded JSON, `{ v: 1, rules: [...] }`, validated with zod when read.
  - A `v` field makes later format changes possible.
  - An invalid or tampered `f` is dropped silently. It never throws.
  - Limits: at most 20 rules, 20 values per rule and 100 characters per value. They bound the regex work a crafted link can cause.
- The URL is updated with `history.replaceState`. Back/forward doesn't step through every keystroke.
- The page number isn't stored. It resets to 1 whenever search, filters or sort change.

### UI sketch

```
Job Manager                                         [Sign in] [Sign up]

[ Search title or company…                                          ]

[Title       ▾][contains any of  ▾][frontend ✕]                    ✕
[Description ▾][contains none of ▾][react ✕]                       ✕
[Description ▾][contains any of  ▾][vue ✕][angular ✕]              ✕
[ + Add filter ]                                           Clear all

Showing 1–50 of 37 · 1283 total
Label ↕                    Company ↕   Posted ↓   Work mode   Applied
Senior Frontend Developer  Nordeus     3d ago     Hybrid      [x]
Frontend Engineer (Vue)    Fivetran    1w ago     Remote      [ ]
…                                                   ‹ 1 2 3 ›  50 ▾
```

- **"+ Add filter"** opens a menu of fields. Picking one adds a rule with a default operator and focuses its value input.
- **Text values are chips.** Enter or comma adds a value, and Backspace in an empty input removes the last one.
- **Work mode** values are a checkbox list. **Posted** has a number input ("last N days") or a native `<input type="date">`.
- **Label** links to the posting in a new tab with `rel="noopener noreferrer"`. The table only stores http(s) URLs (DB check constraint). A job without a URL shows the title as plain text.
- **Posted:**
  - Shows a relative date from `posted_at`.
  - When `posted_at` is missing, it falls back to `first_seen_at`, shown muted with a "first seen" tooltip.
  - Sorting and the Posted filter use the same value.
- **Sorting:** Label, Company, Posted and Work mode are sortable. The default is Posted, newest first.
- **Paging:** client-side, 50 rows per page by default (25 / 50 / 100).
- **Empty result:** "No jobs match" with a "Clear filters" button.

## Implementation Steps

### 1. Database migrations
- **`*_jobs_work_mode.sql`**:
  - `create type public.work_mode as enum ('REMOTE', 'HYBRID', 'ON_SITE')`
  - `alter table public.jobs add column work_mode public.work_mode` (nullable, null means unknown)
  - If the uncommitted `*_jobs.sql` hasn't been applied anywhere yet, this can go into it instead.
- **`*_applications.sql`**:
  - Columns:
    - `user_id uuid not null references auth.users(id) on delete cascade`
    - `job_id text not null references public.jobs(id)`
    - `applied_at timestamptz not null default now()`
  - Primary key `(user_id, job_id)`, which also serves the "my applied IDs" lookup.
  - RLS on, with `select`, `insert` and `delete` policies for `authenticated`: `user_id = (select auth.uid())`. The insert policy uses it as its `with check`.
  - `revoke all … from anon, authenticated`, then `grant select, insert, delete … to authenticated`. There's no update policy, because nothing can be updated yet.

### 2. Scraper: `work_mode`
- Add a pure `detectWorkMode({ title, locationRaw, description, isRemote })` to `scraper/normalize.ts`. The first match wins:
  1. `hybrid` / `hibrid*` in the title or location → `HYBRID`
  2. `isRemote` → `REMOTE`. This includes "Belgrade / Remote": remote is allowed there.
  3. `on-site` / `onsite` / `in-office` / `u kancelariji` in the title or location → `ON_SITE`
  4. In the description, if exactly one mode is mentioned, that mode wins. If hybrid is mentioned together with another mode, `HYBRID` wins. `REMOTE` together with `ON_SITE` gives `null`.
  5. Otherwise `null`. A city on its own doesn't mean on-site.
- Call it from `toRow()` in `scraper/stages/publish.ts`, then run `npm run scrape -- publish` to backfill.
- Estimated coverage on today's data:

  | Result | Jobs |
  |---|---|
  | `REMOTE` | ~290 |
  | `HYBRID` | ~220 |
  | `ON_SITE` | ~50 |
  | `null` | ~720 (~55%): ~475 with a description that says nothing about work mode, ~225 with no description |

### 3. Server-side data
- **`src/lib/supabase/public.ts`** (`server-only`): a `supabase-js` client with the publishable key and `persistSession: false`. It has no cookies, so `'use cache'` functions can use it. RLS limits it to active jobs.
- **`src/lib/jobs/queries.ts`** (`server-only`):
  - `getActiveJobs()`:
    - `'use cache'`, `cacheLife('hours')`, `cacheTag('jobs')`
    - selects `id, title, company_name, location_raw, department, work_mode, posted_at, first_seen_at, url`
    - pages through the results 1000 at a time and maps them to camelCase `JobListItem`
  - `getJobDescriptions()`: same caching. Returns `Record<id, description>` for active jobs that have a description.
  - `getAppliedJobIds(userId)`: uses the session client from `src/lib/supabase/server.ts`, so RLS applies. Not cached. Returns `string[]`.
- **`src/app/api/jobs/descriptions/route.ts`**: `GET` returns `Response.json(await getJobDescriptions())`, and Next compresses the response.
- `cacheLife('hours')` is fine for a list that `publish` refreshes once a day.

### 4. Applied Server Action — `src/app/dashboard/actions.ts` (`'use server'`)
- `setApplied(jobId, applied)`:
  1. `requireUser()`
  2. Validate with zod: `jobId` is a non-empty string of at most 300 characters, `applied` is a boolean.
  3. `rateLimit()` at 60 per minute, key `applied:<userId>`, using `postgresStore`.
  4. If `applied`, `insert … on conflict do nothing`. Otherwise `delete … where user_id and job_id`.
  5. Return `{ ok: true }` or `{ ok: false, error }`.
- The client uses `useOptimistic`. On error the checkbox reverts and a short inline message appears.
- No `refresh()`: the applied IDs aren't cached, so the next navigation reads them fresh.

### 5. Filter engine (client-safe, no React)
- **`src/lib/jobs/types.ts`**: `JobListItem` and `WorkMode`.
- **`src/lib/jobs/filter-schema.ts`**: zod schemas for rules (a discriminated union on `field`) with the limits above. Also `encodeFilters()` / `decodeFilters()` for the URL.
- **`src/lib/jobs/filter.ts`**:
  - `normalize()`
  - `buildIndex(jobs, descriptions?)`, which normalizes each job's text once
  - `compileRules(rules, { showApplied })` → a predicate
  - `matchesSearch()`
  - `sortJobs()`

### 6. UI — `src/components/jobs/`
- Add shadcn components: `table`, `badge`, `checkbox`, `select`, `popover`, `dropdown-menu`, `skeleton`, `tooltip`.

| File | Role |
|---|---|
| `jobs-explorer.tsx` (`'use client'`) | Owns search, rules, sort and page; reads and writes the URL; loads descriptions |
| `jobs-search.tsx` | The search input |
| `filter-bar.tsx` | Rule list, "+ Add filter", "Clear all" |
| `filter-rule.tsx` | Field, operator and value editors for one rule |
| `chips-input.tsx` | Multi-value text input |
| `jobs-table.tsx` | Table, sorting headers, pagination. Also used as the Suspense fallback |
| `work-mode-badge.tsx` | The Work mode badge |
| `applied-checkbox.tsx` | `useOptimistic` + `setApplied` |

### 7. Routes and proxy
- **`src/app/page.tsx`** (new):
  - Public, prerendered static shell.
  - Header: app name plus Sign in / Sign up links.
  - Renders `<Suspense fallback={<JobsTable … />}><JobsExplorer jobs={await getActiveJobs()} /></Suspense>`.
- **`src/app/dashboard/page.tsx`**:
  - Replaces the placeholder.
  - Header: the user's email and Sign out.
  - Inside Suspense: `requireUser()`, then `getActiveJobs()` and `getAppliedJobIds()` in parallel, passed to `<JobsExplorer showApplied appliedIds={…} />`.
- **`src/proxy.ts`**: signed-in visitors on `/` are redirected to `/dashboard`. `/dashboard` stays in `PROTECTED_PREFIXES`.
- **`signOut`** redirects to `/` instead of `/sign-in`.

### 8. Docs
- `project-overview/architecture.md`:
  - route map: `/` and `/api/jobs/descriptions`
  - data model: `work_mode`, the minimal `applications` table
  - Supabase setup table: `public.ts`
- `project-overview/roadmap.md`: Phase 2 links here. Phase 4 notes that `applications` already exists in minimal form.
- `project-overview/security.md`:
  - the public job list
  - the `setApplied` rate limit
  - regex escaping and the limits on URL-derived filters
- `features/job-scraper.md`: `work_mode` in Publishing to Supabase.

## Verification
- **`/` signed out:**
  - All active jobs are listed (count matches `select count(*) from jobs where active`).
  - There is no Applied column and Applied doesn't appear in "+ Add filter".
- **Redirects:**
  - `/dashboard` signed out redirects to `/sign-in`.
  - `/` signed in redirects to `/dashboard`.
  - Sign out lands on `/`.
- **The example from the request:** "Title contains frontend", "Description contains none of react" and "Description contains any of vue" give a non-empty list. Spot-check 5 results by hand.
- **Matching:**
  - "Title contains any of java" doesn't return JavaScript-only roles.
  - `frontend` finds `Front-end` titles.
  - `cacak` finds `Čačak`.
  - `c++` and `.net` work as values.
- **URL:**
  - Reloading keeps search, rules and sort.
  - A copied URL gives the same view in a private window.
  - A hand-edited, broken `f` param loads the page unfiltered with no error.
- **Network tab:**
  - The page response contains no descriptions.
  - `/api/jobs/descriptions` is a separate, compressed response.
  - With a Description rule in the URL, a fresh load shows the skeleton, then results.
- **Applied:**
  - A toggle persists across reloads.
  - A second account doesn't see it.
  - With the anon key, `select * from applications` returns nothing.
  - Toggling more than 60 times a minute shows an error and reverts the checkbox.
- **Build:** `npm run build` shows `/` as prerendered with no blocking-route errors. `npm run lint` passes.

## Out of scope
- Showing the description (row expand or detail drawer). It is only used for filtering for now.
- OR groups and nested rules, and saved filter presets.
- The `/applications` page and application status (Phase 4).
- Synonyms (`Belgrade` / `Beograd`) and Cyrillic ↔ Latin transliteration.
- On-demand revalidation after `publish`. `cacheLife('hours')` covers it for now.
- Company autocomplete in the value input.

## Open questions
The plan uses these defaults. Each one is easy to change.
1. **Label** is the job title.
2. **Posted** falls back to `first_seen_at` when `posted_at` is missing (76% of jobs). After the first scrape all of them show 2026-10-22. The value only becomes meaningful for jobs that appear later.
3. **Unknown work mode stays `—`** (about 55% of jobs) instead of guessing `ON_SITE` from a city name.
4. **Signed-in visitors on `/`** are redirected to `/dashboard` instead of seeing the public view.
5. **Paging** is client-side with 50 rows per page by default, and the default sort is Posted, newest first.
