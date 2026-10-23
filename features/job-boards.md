# Feature: Job Boards

**Status:** Implemented in `scraper/boards/` and `scraper/stages/boards.ts` (`npm run scrape -- boards`).

Remote jobs that someone living in Serbia can apply to, pulled from five public job-board APIs straight into `public.jobs`, next to the [Joberty scraper](./job-scraper.md)'s postings. One run fetches every board, filters, removes duplicates, upserts what's listed now and closes what isn't.

## Decisions
- **Kept:** Serbia, worldwide, or a region that contains Serbia (Europe, EMEA, CEE, Balkans, EU). These are the regions the scraper's `placeJob` already keeps.
- **The newest fetch is the truth.** A posting a board no longer lists becomes `active: false` and leaves the dashboard. It is **never deleted**, because `applications.job_id` cascades on delete and would take users' applications with it.
- **A board that fails keeps its rows as they were.** That covers an HTTP error, a schema change, an incomplete feed and an empty feed. A transient outage must not look like every posting closing, which is the scraper's rule too.
- **Only board rows are touched.** `source` is one of the five board names. The scraper's rows belong to `publish`.
- **No duplicates:**
  - The id is `<board>:<externalId>`, so re-runs upsert in place.
  - The same job across sources counts once (see [Dedupe](#dedupe)).
- **Attribution:** every board's terms require crediting it and linking to its own job page.
  - `url` is always the board's page: Himalayas `applicationLink`, the others' `url`.
  - The dashboard has a Source column ([dashboard.md](./dashboard.md)).
- **Runs after `publish`** in the daily cron ([job-scraper.md](./job-scraper.md#keeping-it-up-to-date)), so dedupe sees the fresh `jobs.json`.

## Sources (verified 2026-10-23)

| Board | Endpoint | Feed | Location data | First run, 2026-10-23: kept / fetched (duplicates) |
|---|---|---|---|---|
| Himalayas | `himalayas.app/jobs/api/search?country=RS&page=N` | Everything open to Serbia, 20 per page, ~182 pages (~3 min at 1 req/s) | `locationRestrictions` (country list, empty = worldwide), `timezoneRestrictions` | 3540 / 3604 (58) |
| Jobicy | `jobicy.com/api/jobs?count=200&cursor=…` | Last 7 days only, ~1200 | `jobGeo` free text | 118 / 1244 (33) |
| RemoteOK | `remoteok.com/api` | Newest ~100, no paging | `location` free text, empty for half | 60 / 99 (2) |
| Remotive | `remotive.com/api/remote-jobs` | The free API returns only 9 jobs | `candidate_required_location` | 6 / 9 (2) |
| Arbeitnow | `arbeitnow.com/api/job-board-api?page=N` | ~5500, 300 per page, mostly Germany | `location`, `remote` | 0 / 5527 |

The whole run takes about 4 minutes and added 3724 active jobs next to the scraper's 1327. A second run straight after added none and closed none.

- Arbeitnow answered 429 on one run, after several full fetches within the hour during testing. The board was marked failed and its rows were left alone, as designed.
- Once a day is well within every board's limits.

- **Himalayas:**
  - `country=RS` already returns worldwide postings plus country lists that include Serbia. `exclude_worldwide` would drop the first group.
  - A page in the middle can come back short (page 156 had 12 jobs), so paging stops only at an empty page.
  - A fetch that reads under 90% of `totalCount` throws instead of closing the rest.
  - `HIMALAYAS_API_KEY` in `.env.local` is optional. It is sent as `Authorization: Bearer …` and raises the limit to 60/min and 10k/day. Without it, every caller shares one public allowance.
- **Jobicy:**
  - Asks for sync passes at most hourly.
  - `/api/jobs/status?ids=…` (100 ids per call, free) answers `active`, `closed` or `unknown` for any job, including older ones.
- **Remotive:** asks for at most 4 calls a day and blocks more than 2 a minute. Its terms also forbid showing its jobs in order to collect signups.
- **Arbeitnow:** its "Remote" postings are remote within Germany or a neighbor (a Dutch heat-pump fitter, "German Defense" pre-sales), so only explicitly Serbian places are kept (`serbiaOnly`).
- **Himalayas, Remotive and Jobicy forbid passing their listings on** to other job boards and aggregators, including Google Jobs via JobPosting structured data.
- **429 handling:** `scraper/http.ts` waits out a `Retry-After` of up to 60s. Anything longer counts as a failed request.

## Location filter
`placeBoardJob()` in `scraper/normalize.ts`. Unlike an ATS location, a board's list means "any of these": "Europe, USA, APAC" is open to Serbia, while `placeJob` would read it as tied to the USA.

1. If `utcOffsets` is non-empty and includes neither +1 nor +2 (CET/CEST), the job is dropped.
2. The location is split on `,` `;` `/` `|` and "or". Himalayas passes its country list as `allowedPlaces` instead.
3. If any part is a Serbian place, the job is kept. `country` is `"RS"` only when Serbia is the only part.
4. If the job isn't remote, or the board is `serbiaOnly`, it is dropped.
5. If any part leaves nothing behind after stripping `REMOTE_NOISE`, the job is kept. "Worldwide", "Anywhere", "Remote", "EMEA" and "UTC+1" all count; "USA timezones" leaves "usa", so it doesn't. An empty location is kept too.
6. If the title names a place elsewhere (`FOREIGN_MARKERS`, e.g. "Sales Manager - UK"), the job is dropped.

`remoteScope` comes from `REMOTE_SCOPES`, as in the scraper.

## Dedupe
- **Key:** `coreName(company) | plain(title)`, so "Fivetran Serbia" and "Fivetran" match.
- **Order:**
  1. Active jobs in `scraper/data/jobs.json` win, because they link straight to the company's ATS.
  2. Between boards, the earlier one in `BOARD_NAMES` wins: Himalayas, Jobicy, RemoteOK, Remotive, Arbeitnow.

## Closing
After the upsert, every active row of a board that read fine but isn't in this run's kept set becomes `active: false`. There is one exception for the short feeds, Jobicy and RemoteOK.

A job that **aged out of the feed** stays active for 30 days from `posted_at` (or `first_seen_at`). "Aged out" means it is absent from the feed, not filtered out or a duplicate. It closes earlier when either of these happens:
- Jobicy's status check says `closed`. `unknown` is unconfirmed, not closed.
- Another board or the scraper now lists the same job.

## Columns
Every board row has:
- `company_joberty_id = null`. Migration `*_jobs_board_sources.sql` made the column nullable.
- `first_seen_at` kept from the existing row, `last_seen_at` = the run.
- `work_mode` from `detectWorkMode` (almost always `REMOTE`).
- `description` as plain text from `htmlToText`.

Like `publish`, the run ends with `revalidateJobs()`, so the dashboard shows the new list on its next visit ([job-scraper.md](./job-scraper.md#publishing-to-supabase)).

`scraper/data/boards-report.json` records, per board: status, error, fetched, kept, outsideSerbia, duplicates, closed and stillActive.

## Known limitations
- **RemoteOK:**
  - Its feed has some spam postings and mis-encoded company names ("Sothebyâs"), which come that way from the source.
  - An empty location is treated as unrestricted.
- **Dashboard payload:**
  - Active jobs went from 1327 to 5051.
  - Active descriptions went from ~3.7 MB to **18.3 MB** (14.6 MB from the boards, mostly Himalayas, ~3,800 characters each).
  - The dashboard loads every active job and every description client-side ([dashboard.md](./dashboard.md#description-loading)), so the payloads grow with them. Measured on the dev server after the first revalidation: `/` went from 0.7 MB to 2.5 MB of HTML, and `/api/jobs/descriptions` from 3.8 MB to 18.9 MB (uncompressed). Not addressed yet.
