# Callback — Testing

**Status:** Unit tests exist for the code that has no framework in it, and the deploy workflow runs them before it ships anything. There are no integration or end-to-end tests yet.

`npm test` runs 299 tests in about a second. `npm run test:watch` re-runs them as you edit.

## What is covered

Tests sit next to the code they test (`*.test.ts`), run with [Vitest](https://vitest.dev) in plain Node, and import from the `@/` alias like the app does.

| Area | File | What it pins down |
|---|---|---|
| Job filter engine | `src/lib/jobs/filter.test.ts` | Whole-word matching (`java` is not `javascript`), case and diacritics (`cacak` finds Čačak), hyphens, search over title and company, every operator, work mode, posted and applied rules, rules with no value doing nothing, unknown rules staying inert, regex characters in a value treated as text, the sort for each column, and **Callback jobs always sorting first** |
| Filters in the URL | `src/lib/jobs/filter-schema.test.ts` | Round trip, URL-safe output, non-ASCII text, a bad or tampered link being dropped instead of throwing, and the limits (20 rules, 20 values, 100 characters) |
| Job types and dates | `types.test.ts`, `format.test.ts` | Source labels, which jobs count as posted on Callback, relative and absolute dates, and the time zone the day is taken in |
| The fictional dev job | `src/lib/jobs/dev-fixtures.test.ts` | It is **not** added in production or under test, only in development |
| Rate limiting | `src/lib/rate-limit.test.ts` | The client IP is the proxy's (last) `X-Forwarded-For` entry, which a client can't forge; the fixed window and what happens when it ends |
| Accounts | `src/lib/auth/account-type.test.ts`, `schemas.test.ts` | Anything unknown is a candidate, each type's home, and the sign-in, sign-up and password-reset rules |
| Companies | `src/lib/companies/company.test.ts` | Only the exact slug is a company, so anything else is a 404 |
| Posting dates | `scraper/extract/posted-at.test.ts`, `scraper/ats/details.test.ts` | The strict date parser (ISO with and without an offset, Java's `Date.toString()`; refuses `01.10.2026`, `Oct 1, 2026`, 31 February, years before 2000, dates a day ahead), `datePosted` from JSON-LD and `itemprop` (never a bare `<time>`; two different dates count as none), and Workday, BambooHR and SuccessFactors giving the description and the date from one call, with a failed call distinct from a detail that has no date |
| Reading job pages | `scraper/stages/descriptions.test.ts`, `scraper/stages/finalize.test.ts` | Which jobs are read (lacking a date or a description, not read in the last 14 days; `--force` reads all), that a page that couldn't be read gets no mark, that a date or description the source gave is never replaced, and that `finalize` keeps a date read from a page across a re-scrape |
| robots.txt policy | `scraper/http.test.ts`, `scraper/browser.test.ts`, `scraper/stages/jobs.test.ts`, `scraper/stages/careers.test.ts`, `scraper/ats/talentlyft.test.ts`, `scraper/stages/finalize.test.ts` | Any `Disallow` for `*` refuses a site (even `/wp-admin/`), while an empty one, `Allow`, another bot's group, no file and an HTML answer don't; 401/403/429/5xx/no answer refuse it too but not as "said no"; one answer per site; `fetchHtml`, the browser and TalentLyft's hosted site don't touch a refused site; the jobs stage doesn't walk its careers page but still reads an ATS's public API; a refused recheck keeps the earlier careers result; `finalize` closes the jobs of a site that said no, keeps those of one that couldn't be asked, and leaves Joberty's list alone |
| Scraper's browser | `scraper/browser.test.ts` | A Chromium that never started (a missing system library on the server) doesn't crash a finished run in `closeBrowser()`: it says so once, and a browser that did start is closed once. Playwright is a mock |
| Mock candidates | `src/lib/candidates/mock-candidates.test.ts` | Exactly three, unique keys and emails, every email on `example.com` (the seed must never touch a real address), each has its CV and letter in the landing demo, and the demo job's PDFs are committed (Priya Raman's cover letter left out on purpose) |
| Applicant review | `src/lib/review/navigation.test.ts`, `matches.test.ts`, `src/lib/companies/workspace.test.ts` | Next goes to the next applicant not viewed yet, wrapping round, and answers "everyone viewed"; where the screen opens; the screening overview's counts (case-insensitive, "not checked" when matches are null); `getJobApplicants` answering file names, never storage paths, in a stable order |
| Opening an application's document | `src/app/api/applications/[applicationId]/documents/[kind]/route.test.ts` | Bad id or kind, a browser navigation (`Sec-Fetch-Dest` other than `empty`), a candidate, no application under row level security and a missing file each answer 404; no session 401; the file is read only after the caller's own client found an active application; `private, no-store`; 240 a minute. Supabase and the session are mocks |
| Deleting a job | `src/app/(employer)/[company]/actions.test.ts` | `deleteJobPosting`: refuses an id that isn't a uuid, needs an employer account, answers "Job not found" when row level security deletes nothing, deletes and refreshes, and the 30 a minute limit. The Supabase client and the session are mocks |
| Review marks | `src/app/(employer)/[company]/actions.test.ts` | `markApplicationViewed` and `setApplicationLiked`: a uuid and a boolean, an employer account, only `viewed_at` or `liked_at` on that application, no refresh, "Application not found" when row level security updates nothing, and a shared limit of 120 a minute |
| Pricing | `src/components/landing/pricing-plans.test.ts` | The yearly discount and how prices are written |

**The tests were checked against the code, not just run.** Breaking the code on purpose in four places (taking the first `X-Forwarded-For` entry, dropping the Callback-first sort, allowing 2000 filter rules, and adding the fake job outside development) made tests fail each time.

## How the deploy uses them

`.github/workflows/deploy.yml` has two jobs:

1. **`test`** installs, runs `npm run lint` and `npm test`. It needs no secrets, and it also runs for pull requests into `main`, so a change shows its result before it is merged.
2. **`deploy`** has `needs: test` and runs only on `main`, so a failing test (or lint error) stops the release before anything is built or uploaded.

A run that finds no test files at all also fails (`vitest.config.mts`), so a broken test setup can't pass quietly. The build in the `deploy` job still type-checks the whole project.

To make `main` itself refuse a merge when `test` fails, turn on a branch protection rule that requires the `test` check (GitHub → Settings → Branches). Without it the workflow still blocks the deploy, but GitHub lets the merge happen.

## What is not covered

- **Pages and most Server Actions**, which need Next.js and Supabase: the sign-up flow with its account-type dialog, `markApplied`, `setSaved`, the proxy's redirects, the employer dashboard. (`deleteJobPosting` is covered above, with its dependencies mocked.)
- **The database:** the row level security policies that make applying irreversible and keep users out of each other's data. Testing them needs a Postgres with the migrations applied, for example a local Supabase. It would be the most valuable integration test. The employer tables (`companies`, `job_postings`, `job_applications`, `candidate_profiles`) and `ensure_employer_workspace()` were checked once by hand, in a throwaway Postgres with stand-ins for Supabase's `auth` schema ([features/demo-job.md](../features/demo-job.md#verification)); that script is not saved as a test.
- **The scraper** (`scraper/`): ATS adapters, extraction and normalisation. The pure parts are easy to test next. A workflow that fetches live sites should not be part of the gate.
- **The deploy scripts:** `deploy/activate-release.sh` was checked by hand against a fake `systemctl` and a fake health endpoint (first deploy, a healthy deploy, a failed one rolling back, keeping three releases), but those checks are not saved as tests.
- **The browser:** no end-to-end test drives the app. Playwright is already a dependency, and could cover sign-in, routing by account type and `/api/health`. The applicant review was driven once by hand with a throwaway Playwright script ([features/applicant-review.md](../features/applicant-review.md#verification)); it is not saved as a test.

## Writing a test

- Put `name.test.ts` next to `name.ts`. Import `describe`, `it`, `expect` (and `vi` for fake timers and environment variables) from `vitest`: nothing is global.
- Keep to code that doesn't import `@/lib/env` (it throws without the production environment) or `server-only`. If a module needs either, test the pure part on its own, or add an alias for it in `vitest.config.mts` first.
- Freeze the clock with `vi.useFakeTimers()` and `vi.setSystemTime(...)` rather than comparing with the real `Date.now()`.
- A test should fail when the behaviour it names is broken. After writing one, break the code on purpose once and watch it go red.
