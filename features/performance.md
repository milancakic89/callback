# Performance: more visitors at once, faster pages, a steadier server

**Status:** Implemented on 2026-11-13, on the branch `perf/scale-for-load` (not committed, not deployed). The index migration is already applied to the production database; the server files (Caddyfile, unit files) need the manual step in [deployment.md](../project-overview/deployment.md#compression-and-limits) after the deploy.

## Why
Measured on 2026-11-13. The setup:
- the app: a local production build (`next build`, standalone `server.js`, Apple M1 Pro), load from 10–50 virtual visitors, each with its own `X-Forwarded-For`;
- the database: a local Postgres 17 container set up like the production instance (2 CPUs, 1 GB, `shared_buffers=224MB`, `effective_cache_size=384MB`, `jit=off`, `random_page_cost=1.1`), with every migration applied and synthetic data for 1,000 and 10,000 companies. Each company has 1–2 published jobs, each job 100–150 applicants, and the queries run as PostgREST runs them (embeds as lateral joins, `authenticated` with RLS).

| What | Measured | Cause |
|---|---|---|
| `/jobs` | **5.6 requests/s**, p50 **9.3 s** with 50 visitors; server memory up to 2.2 GB | Every request renders all 6,351 jobs into the client component (`connection()` for `now`) and gzips 6.5 MB of HTML. `/dashboard` does the same. The fallback gets the whole list too. |
| `/api/jobs/descriptions` | **27.7 MB, uncompressed**, for every visitor of `/jobs` and `/dashboard` | All descriptions are loaded up front; Next doesn't compress this cached response and Caddy has no `encode` |
| Reviewing applicants (`getJobApplicants`) | 441 ms at 1,000 companies; **4.5 s** at 10,000; **50 s** with 10 employers at once | `interview_invitations` has no index on `application_id` (only a partial one, for open invitations), so the embed reads the whole table once per applicant. Production has `statement_timeout=8s` for `authenticated`, so under load this becomes an error, not just a slow page. With the index: **3.7 ms**, 2.6 → 300 queries/s. |
| Company home (`getCompanyJobs`) | 900 → 322 queries/s from 1,000 to 10,000 companies | No company filter: RLS filters a seq scan of every posting |
| Jobs posted on Callback, on `/jobs` | silently cut at 1,000 | `published_job_postings` is called without paging, and Supabase answers at most 1,000 rows. At 1.5 jobs a company that is about 670 companies. |
| `/`, `/sign-in`, `/companies/[slug]` | 390–740 requests/s | fine |
| Reading a CV (`extractPdfText`) | 5.2 ms a CV; re-checking 150 CVs ≈ 0.8 s | fine, left alone |

Database size: 1,000 companies ≈ 270 MB (plus 76 MB of scraped jobs); 10,000 ≈ 2.6 GB.

## What was done

### 0. Preparation
- `scripts/load-test.ts` and `npm run load:test -- <url> [--concurrency 10] [--seconds 15] [--accept-encoding gzip] [--server-pid <pid>]` (no new dependencies, run with tsx like the other scripts): virtual visitors with their own `X-Forwarded-For`; p50/p95/p99, throughput, MB/s, and the server's CPU and RSS when given its process id. The arithmetic is in `scripts/load-test-stats.ts` and tested; `vitest.config.mts` now also picks up `scripts/**/*.test.ts`.
- The "before" numbers are the ones measured earlier with the first version of the script (same logic, plain JS); they were not re-measured with the TypeScript one.

### 1. Database
- Migration `supabase/migrations/20261114120000_performance_indexes.sql`: `interview_invitations (application_id)`, `applications (job_id)`, `saved_jobs (job_id)`, all `create index if not exists`. Applied to production with the Supabase MCP `apply_migration` (named `performance_indexes`; Supabase records its own timestamp as the version, as it did for the earlier migrations) once the tests passed.
- `getCompanyJobs(companyId)` (`src/lib/companies/workspace.ts`) filters on `company_id`; the workspace page passes the id `ensureEmployerWorkspace()` already returns.
- `fetchAllPages()` in `src/lib/supabase/paginate.ts` replaces the two hand-written loops in `src/lib/jobs/queries.ts`, and pages the unfiltered `published_job_postings` call too (`.range()`; the function already orders by `published_at desc, id`, so the pages are stable). The list still throws rather than caching a list without the posted jobs. A call for one job or one company stays a single request.

### 2. The job list
- New static route `src/app/api/jobs/list/route.ts`: `getActiveJobs()` as JSON, same cache and `jobs` tag as the descriptions route.
- `/jobs` is fully static: no `connection()`, no `Date.now()` on the server. The fallback gets `previewRows` (the first 20 rows, sorted on the server by `previewOf()` in `src/lib/jobs/preview.ts`) and `totalCount`, not the whole list. `JobsExplorer` without a `jobs` prop loads `/api/jobs/list` (`use-job-list.ts`) and shows the 20 rows until the list arrives, as long as nothing has been searched, filtered, sorted or paged (those wait with the table's skeleton instead of showing wrong rows). `now` is set from the browser's clock in the promise callback when the list arrives, never during render. A failed load shows `JobListError` with Retry.
- `/dashboard`: the same; its dynamic part sends only the applied and saved ids.
- `/saved-jobs`: unchanged (its own small list, passed as `jobs`, and `now`).
- Descriptions on demand: `src/app/api/jobs/descriptions/[jobId]/route.ts` and a cached `getJobDescription(id)` for the description sheet. The id is checked before the cache (1–255 characters, no control characters; a `callback:` id must be a uuid), because half of the scraped ids hold a `/` or a space (Himalayas: `himalayas:company/job`), so a strict charset can't be used. The client encodes the id into the path (`%2F` is decoded by Next; checked). The full bundle `/api/jobs/descriptions` is loaded only once a Description rule has something to look for (`rulesUseField(rules, "description")`), a rule from the URL included.
- `jobs-explorer.tsx` (355 lines before, 277 now) is split. The loading is in `use-job-list.ts` and `use-job-descriptions.ts`, built on the pure functions in `src/lib/jobs/load.ts` (`loadJobList`, `loadDescriptionBundle`, `loadDescription`) that take `fetch` as a parameter. The applied and saved state and their Server Action calls (about 100 lines) moved to `use-applied-jobs.ts` and `use-saved-jobs.ts`, which take the action as a parameter: the plan didn't list these two, but the file stayed over 300 lines without them.

### 3. Server
- `deploy/Caddyfile`: `encode zstd gzip`; `Cache-Control: public, max-age=60, stale-while-revalidate=600` on `/api/jobs/list` and `/api/jobs/descriptions*`, set with `>` so it replaces the `s-maxage` Next sends. Checked against a Caddy 2 container in front of the local build (below).
- `next.config.ts`: `compress: false`. Caddy then compresses on all four cores, not Node on its one thread.
- `deploy/callback.service`: `NODE_OPTIONS=--max-old-space-size=2048`, `MemoryMax=3G`. `deploy/callback-scraper.service`: `CPUQuota=200%`, so the 05:00 scrape leaves the app two of the four vCPUs.
- The deploy workflow doesn't install unit files or the Caddyfile. Running `deploy/setup-server.sh` again (or installing them by hand, `systemctl daemon-reload`, `caddy validate`, `systemctl reload caddy`, `systemctl restart callback`) is a manual step, written up in [deployment.md](../project-overview/deployment.md#compression-and-limits).

### 4. Documentation
This file; the new routes in `project-overview/architecture.md` and `security.md`; Caddy, the unit limits and the manual step in `deployment.md`; the new tests in `testing.md`; a note in `features/dashboard.md`.

### Not now
- PDF reading in a worker thread: 5.2 ms a CV.
- More than one Node process: the rate limit, `'use cache'` and `updateTag` live in one process's memory. After step 2 one process is enough; a shared `cacheHandlers` is the step after that.
- The Supabase plan is an operational decision: around 1,000 companies the database passes the Free plan's 500 MB.

## Results

### HTTP: a local production build, 50 visitors, 10–15 s each
`npm run load:test`, `--accept-encoding gzip`. The "before" build gzipped in Node; the "after" build sends no compression (`compress: false`, Caddy does it in production), so its MB/s are uncompressed.

| Route | Before | After |
|---|---|---|
| `/jobs` | 5.6 req/s, p50 9,260 ms, server memory up to 2.2 GB, 6.5 MB of HTML | **995 req/s**, p50 **48 ms**, p95 61 ms, p99 96 ms, server memory max **375 MB**, 135 KB of HTML |
| `/api/jobs/list` | (the list was inside every page) | 777 req/s, p50 62 ms, 2.86 MB a response, server memory max 518 MB |
| `/api/jobs/descriptions/{jobId}` | (did not exist) | 3,157 req/s, p50 15 ms, about 4 KB |
| `/api/jobs/descriptions` (the bundle) | 27.7 MB, fetched by every visitor of `/jobs` and `/dashboard`, no `Content-Encoding` | 27.7 MB, fetched only when a Description filter is used; 111 req/s with 10 visitors; 6.9 MB through Caddy's zstd |
| `/` | 738 req/s | 846 req/s |
| `/companies/my-comp` | 389 req/s | 453 req/s |
| `/sign-in` | 412 req/s | 547 req/s |

What a visitor of `/jobs` downloads: before, about 0.7 MB of gzipped HTML plus the 27.7 MB of descriptions, so about 28 MB. After, through Caddy: 9.5 KB of HTML plus 368 KB of list (zstd), so about 0.38 MB, and the descriptions only if they filter on them or open one (about 2 KB each).

The targets were: `/jobs` over 200 req/s with p50 under 300 ms and the server under 600 MB (met), `/api/jobs/list` over 200 req/s (met), no descriptions downloaded when `/jobs` opens (met, below).

`npm run build`: `/jobs` and `/api/jobs/list` are `○` static (revalidate 1h, expire 1d); `/api/jobs/descriptions/[jobId]` is `ƒ` dynamic (its data is cached by `getJobDescription`); `/dashboard` stays `◐`.

### In a browser (Playwright's Chromium against the local build)
- Opening `/jobs`: the first paint says `Showing 1–20 of 6351 · 6351 total`; the only API request is `/api/jobs/list`; Posted becomes "14 hours ago" once it arrives; searching `engineer` gives 1,511 matches.
- The eye button on a row requests `/api/jobs/descriptions/pythonorg%3A8188` and shows the text; the bundle is not requested.
- Adding a Description rule: no bundle request while the rule is empty, one as soon as it has a value (502 matches for `kubernetes`).
- `/jobs?f=<a Description rule>` requests the list and the bundle on load; `/jobs?q=designer` shows the skeleton, not the preview rows, and ends at 158 matches.
- No console errors or hydration warnings on any of these.
- Not checked in a browser: `/dashboard` and `/saved-jobs` (they need a candidate sign-in, and the check would write to the production project); they are covered by the explorer's tests, tsc and the build.

### Caddy (a `caddy:2` container in front of the local build, the production Caddyfile with the address and upstream changed)
`caddy validate` says "Valid configuration". With `Accept-Encoding: zstd, gzip`: `/api/jobs/list` 2,857,108 → 368,476 bytes (`content-encoding: zstd`), the bundle 27.7 MB → 6.9 MB, `/jobs` 134,568 → 9,517; `gzip` alone gives gzip, none gives the plain body. The three job-data paths answer `Cache-Control: public, max-age=60, stale-while-revalidate=600`; `/jobs` keeps Next's `s-maxage=3600` and `/sign-in` its `no-store`.

### Database: local Postgres 17 with 10,000 companies
| Query | Before | After |
|---|---|---|
| Reviewing applicants (`getJobApplicants`) | 4,514 ms (1 client) | **7.8 ms** a transaction with 1 client, 265 queries/s with 10 clients (the query itself: 5.2 ms in `EXPLAIN ANALYZE`). The plan uses `Index Scan using interview_invitations_application_id_idx`. |
| Company home (`getCompanyJobs`) | 320–328 queries/s (10 clients) | **717 queries/s** with the `company_id` filter |

The migration was checked on this container by dropping the index made by hand and running the file: three `CREATE INDEX`, no error.

**The company home did not reach the 800 queries/s of the plan.** The filter takes it from 320 to 717; what is left is the count of active applications per job, which reads about 100 index entries and their rows (for `withdrawn_at is null`) with the row level security check on each. An experiment on this container, not in the migration: `create index on job_applications (job_posting_id) where withdrawn_at is null` made it 1,165 queries/s (the count becomes an index-only scan). It adds an index to the biggest table, and the production migration was approved as the three above, so it is left as a decision: it is worth it somewhere past a few thousand companies.

### Production database (read-only apart from the one migration)
- `apply_migration` succeeded; `pg_indexes` shows `interview_invitations_application_id_idx`, `applications_job_id_idx` and `saved_jobs_job_id_idx`. The tables are small there (11,581 jobs, a handful of applications), so the build was instant.
- Performance advisors afterwards: `unindexed_foreign_keys` (INFO) now lists two others, `google_calendar_connections_connected_by_fkey` and `interview_invitations_created_by_fkey`, which are not part of this plan; `unused_index` (INFO) lists the three new indexes (no query has used them yet) and five older ones; `multiple_permissive_policies` (WARN) for `candidate_profiles` and `jobs`, which were there before. The advisors were not run before the migration, so there is no earlier list to compare with.
- `list_migrations` on production does not list several migrations whose tables exist there (for example `interview_invitations`), so it is not a complete record of what was applied.

## Existing tests that changed, and why
Only where the behavior changed on purpose; every assertion kept its meaning, and the new behavior has tests of its own.
- `src/lib/jobs/queries.test.ts`: the unfiltered `published_job_postings` call is now read a page at a time with `.range()`, so the mock for `rpc()` must be pageable. Three `rpcPublic.mockResolvedValue(...)` lines (the default in `beforeEach`, and "lists only the scraped jobs when nothing is published" and "throws when the published jobs can't be read" in `getActiveJobs`) became `rpcPublic.mockReturnValue(rpcAnswer(...))`, where `rpcAnswer` is awaitable as before and also has `.range()`. The tests for one job and one company (single requests) are untouched. New tests: paging 2,500 posted jobs, an error on the second page, paging the scraped jobs, and all of `getJobDescription`.
- `src/lib/companies/workspace.test.ts`: `getCompanyJobs` now takes a company id and filters with `.eq("company_id", companyId)` right after `select`, so the hoisted mock chain gained that step (`selectJobs` returns `{ eq: eqCompany }`, which returns `{ is }`) and the two existing calls pass `COMPANY_ID`. New test: the query is filtered by that company.

No other existing test was changed. `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass.

## Verification (what is left for a person)
- After a deploy (only when asked to push `main`): do the manual server step, then `curl -sI -H 'Accept-Encoding: zstd, gzip' https://callback.rs/api/jobs/list` should show `content-encoding: zstd` and the `public, max-age=60` header.
- By hand in a browser, signed in as a candidate: `/dashboard` (Applied and hearts, the sheet, a Description filter) and `/saved-jobs`; as an employer, reviewing applicants with an interview.
