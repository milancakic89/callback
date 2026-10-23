# Feature: Job Boards

**Status:** Implemented in `scraper/boards/` and `scraper/stages/boards.ts` (`npm run scrape -- boards`).

Remote jobs that someone living in Serbia can apply to, pulled from fourteen job boards (public APIs and RSS feeds) straight into `public.jobs`, next to the [Joberty scraper](./job-scraper.md)'s postings. One run fetches every board, filters, removes duplicates, upserts what's listed now and closes what isn't.

## Decisions
- **Kept: only postings someone living in Serbia can be hired for.** That means one of:
  - located in Serbia;
  - remote with an **explicit** opening that includes Serbia: worldwide, a region that contains it (Europe, EMEA, CEE, Balkans, EU) or its time zone.

  A bare "Remote" or no location at all isn't enough, since that usually means remote within the employer's country, most often the US. This rule was tightened on 2026-10-24 and closed ~95 earlier rows.
- **The newest fetch is the truth.** A posting a board no longer lists becomes `active: false` and leaves the dashboard. It is **never deleted**, because `applications.job_id` cascades on delete and would take users' applications with it.
- **A board that fails keeps its rows as they were.** That covers an HTTP error, a schema change, an incomplete feed and an empty feed. A transient outage must not look like every posting closing, which is the scraper's rule too.
- **Only board rows are touched.** `source` is one of `BOARD_NAMES` (`scraper/boards/board.ts`). The scraper's rows belong to `publish`.
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
| RemoteOK | `remoteok.com/api` + `?tag=…` for 11 tags | Newest ~100 per call, no paging. The tags raised it to 439 distinct jobs (2026-10-24) | `location` free text, empty for half | 60 / 99 (2); with tags 88 / 439 |
| Remotive | `remotive.com/api/remote-jobs` | The free API returns only 9 jobs | `candidate_required_location` | 6 / 9 (2) |
| Arbeitnow | `arbeitnow.com/api/job-board-api?page=N` | ~5500, 300 per page, mostly Germany | `location`, `remote` | 0 / 5527 |

The whole run takes about 4 minutes and added 3724 active jobs next to the scraper's 1327. A second run straight after added none and closed none.

### Added 2026-10-24
These were found through the source list on [remoteted.com](https://remoteted.com/o-nama), a Serbian aggregator of remote jobs. Each one was checked here: its feed, its `robots.txt` and, where readable, its terms.

| Board | Endpoint | Feed | Location data | First run: kept / fetched (duplicates) |
|---|---|---|---|---|
| We Work Remotely | `weworkremotely.com/remote-jobs.rss` + 11 `categories/*.rss` | Newest 25–100 per feed | `<region>` ("Anywhere in the World", "USA Only"); title "Company: Role" | 419 / 476 (21) |
| Working Nomads | `workingnomads.com/api/exposed_jobs/` | Newest ~40 | `location` | 22 / 41 (3) |
| 4 Day Week | `4dayweek.io/api/v2/jobs?country=Serbia&work_arrangement=remote,hybrid,onsite` | Everything open to Serbia (server-side), 60 req/min; asks for a link back | `locations[]` (countries) | 16 / 26 (10) |
| Jobspresso | `jobspresso.co/feed/?post_type=job_listing&paged=N` (5 pages) | Newest 100 | `dc:creator` "Company ⚲ Location" | 34 / 100 (6) |
| Cryptocurrency Jobs | `cryptocurrencyjobs.co/index.xml` | Newest ~50 | sentence in the description; title "Role at Company" | 24 / 47 (3) |
| Remote First Jobs | `remotefirstjobs.com/rss/jobs.rss` | Newest 100 | sentence or "Location:" line in the description | 16 / 100 (1) |
| NoDesk | `nodesk.co/remote-jobs/index.xml` | Newest 10 | sentence in the description | 0 / 10 |
| Python.org | `python.org/jobs/feed/rss/` | Newest 20 | bare text before the description's first tag; title "Role, Company" | 8 / 20 (2) |
| Hacker News | HN Algolia API: the latest "Ask HN: Who is hiring?" thread | One comment per company, remote ones only | first line "Company \| Role \| Location \| REMOTE" | 43 / 133 |

- **Result:** 611 new active jobs, 4333 board jobs in all, and 5761 active jobs with the scraper's. No duplicate company + title among active board rows.
- **Not added:**
  - Landing.jobs: `robots.txt` disallows `/api/`.
  - Authentic Jobs, Workew and Remote Woman: their feeds carry no company or location field, and they total ~20 jobs.
  - The Muse: see [the earlier check](#sources-verified-2026-10-23). Its "Flexible / Remote" is mostly US-only, and its terms are stricter.
- **We Work Remotely's** terms page sits behind a Cloudflare challenge and couldn't be read. Its RSS feeds are published openly and allowed by `robots.txt`; every posting links back to its page.

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

## Company careers (2026-10-24)
RemoteTed's largest source is "Karijere firmi": companies' own ATS boards. This is the same idea, with the companies taken from our own job boards.

- **Discovery:** `npm run scrape -- discover` (`scraper/stages/discover.ts`) takes every company with an active job-board posting, about 1,500.
  - It guesses that company's board on Greenhouse, Lever, Ashby, Recruitee and Breezy. The slug comes from the name, plus the domain of a "URL:" line in We Work Remotely descriptions.
  - Workable is left out because of its rate limit. SmartRecruiters is left out because its adapter only reads Serbian postings.
- **A board counts only when it's provably that company's:**
  - it lists a posting with the same title as one of the company's job-board postings, or
  - the ATS reports exactly the same, distinctive company name: two or more words, or 6+ letters.

  `coreName()` isn't used here, because it would equate "Recall Labs" with "Recall". A short common name like "Plume" needs the title match.
- **Results** go to `scraper/data/company-boards.json`. Found boards are kept, and misses are retried after 60 days, so a daily run only probes new companies.
  - **First run:** 529 boards from 1,492 companies, in ~9 minutes: Greenhouse 298, Recruitee 153, Ashby 41, Lever 26, Breezy 11. 379 were confirmed by name and 150 by title.
- **Reading:** `companyboards` (`scraper/boards/companyboards.ts`) runs every found board through the scraper's own ATS adapter, eight at a time.
  - Ids are `companyboards:<ats>:<slug>:<id>`, so they never collide with the scraper's `<ats>:<id>`.
  - Each list is complete, so a job gone from it is closed.
  - A board that can't be read reports its prefix in `failedPrefixes`, and its rows stay as they were. The whole board fails if more than half of the sub-boards do.
- **First run:** 28,203 postings, of which 852 passed the Serbia filter after dedupe, from 134 companies:
  - Europe 312, Worldwide 168, EMEA 94.
  - 64 in Serbia (JetBrains, Nebius, Xsolla and others).
  - 214 with country lists that include Serbia.
  - 299 Himalayas rows were replaced by their direct-ATS copies.
- **Order in `refresh`:** `publish → discover → boards`. Discovery reads company names from the previous boards run, and the boards it finds are read the same night.

## Location filter
`placeBoardJob()` in `scraper/normalize.ts`. Unlike an ATS location, a board's list means "any of these": "Europe, USA, APAC" is open to Serbia, while `placeJob` would read it as tied to the USA.

1. If `utcOffsets` is non-empty and includes neither +1 nor +2 (CET/CEST), the job is dropped.
2. The location is split on `,` `;` `/` `|` and "or". Himalayas passes its country list as `allowedPlaces` instead.
3. If any part is a Serbian place, the job is kept. `country` is `"RS"` only when Serbia is the only part.
4. If the job isn't remote, or the board is `serbiaOnly`, it is dropped.
5. The job is kept only if some part is an **explicit opening**. A part counts as one when it names no place and opens a region or the world (`OPEN_REGION`): "Worldwide", "Anywhere in the World", "Europe", "EMEA", "Remote (EU)", "UTC+1", "CET (+/- 3 hours)". "Names no place" means nothing is left after stripping `REMOTE_NOISE`, and `U.S.` is read as `US` first. This is the any-of reading: "Europe, USA, APAC" is kept.
   - **Dropped:** a bare "Remote", "100 % remote", "Remote-first", "NYC or Remote", "Remote, anywhere in Spain", "Full-time", and an empty location.
   - **RemoteOK's empty locations are stored as "Worldwide".** remoteok.com itself shows them as "🌏 Worldwide".
6. If the title names a place elsewhere (`FOREIGN_MARKERS`, e.g. "Sales Manager - UK"), the job is dropped.

`remoteScope` comes from `REMOTE_SCOPES`, as in the scraper.

## Dedupe
- **Key:** `coreName(company) | plain(title)`, so "Fivetran Serbia" and "Fivetran" match.
- **Order:**
  1. Active jobs in `scraper/data/jobs.json` win, because they link straight to the company's ATS.
  2. Between boards, the earlier one in `BOARD_NAMES` wins:
     1. Company careers (`companyboards`), because it links straight to the employer.
     2. Himalayas, Jobicy, RemoteOK, Remotive and Arbeitnow.
     3. The other 2026-10-24 boards: structured locations first, free-text ones and Hacker News last.
- **A board or sub-board that fails still holds its jobs.** Its active rows stay as they were, and their keys count as taken, so a later board can't add a second copy.

## Closing
After the upsert, every active row of a board that read fine but isn't in this run's kept set becomes `active: false`. There is one exception for the short feeds (`SHORT_FEEDS`): every board that is only a window of its newest postings.

- **Short feeds:** Jobicy, RemoteOK, and every RSS feed. Hacker News too, since it is this month's thread.
- **Complete feeds:** only Himalayas, Remotive, Arbeitnow and 4 Day Week return their whole list.

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
- **RemoteOK:** its feed has some spam postings and mis-encoded company names ("Sothebyâs"), which come that way from the source.
- **Company careers:**
  - Breezy lists carry no description, so 57 such rows (Social Discovery Ventures) have none.
  - The run peaks at ~1.2 GB of memory. Big boards are parsed whole: TSMG's Lever list is 34 MB and ~4,500 postings, and Lever requests are allowed 2 minutes for it.
- **Free-text locations are a best effort.** `locationFromText()` in `scraper/boards/rss.ts` only reads clear phrases: "no geographical restrictions", "remotely anywhere in Canada", "based in the UK" and "Location: …".
- **Hacker News comments are free text.**
  - The title is the first part that looks like a role, else "Open roles".
  - The company is the first part without its URL or parenthetical.
  - Multi-role comments stay one row.
- **Python.org titles are split at the last comma**, so a company ending in ", Inc." reads as "Inc.".
- **Arbeitnow answers 429 around page 15 at 1 request/s**, so it is paced at one request every 4s.
- **Dashboard payload:**
  - Active jobs went from 1327 to 5051 (5761 after the 2026-10-24 boards and adapters).
  - Active descriptions went from ~3.7 MB to **18.3 MB** (14.6 MB from the boards, mostly Himalayas, ~3,800 characters each).
  - The dashboard loads every active job and every description client-side ([dashboard.md](./dashboard.md#description-loading)), so the payloads grow with them. Measured on the dev server after the first revalidation: `/` went from 0.7 MB to 2.5 MB of HTML, and `/api/jobs/descriptions` from 3.8 MB to 18.9 MB (uncompressed). Not addressed yet.
