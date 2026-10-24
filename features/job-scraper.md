# Feature: Job Scraper (Phase 3)

**Status:** First version implemented in `scraper/` (`npm run scrape`). Output is JSON files, and `publish` upserts `jobs.json` into the Supabase `jobs` table ([Publishing to Supabase](#publishing-to-supabase)). See [Implementation notes](#implementation-notes) for where the code differs from the plan below.

Collects open positions automatically along the path a person would follow by hand: Joberty company list → company website → careers page → (country dropdown) → open positions. Scope is **companies with an office in Serbia**, keeping **positions in Serbia plus remote positions**.

## Context

Phase 3 of [roadmap.md](../project-overview/roadmap.md) leaves the job data source as an open decision. This doc is the proposed answer: a standalone script that builds a job list from public data at zero running cost.

### Decisions
- **No running costs:** no LLM, no paid services. Only public APIs, HTML and a local headless browser.
- **JSON output** in `scraper/data/`. Tables for Supabase are designed later from the real data shape (`scraper/types.ts`).
- **Companies:** Joberty filter `location=Serbia` (~1,984 companies).
- **Jobs kept:** located in Serbia, or remote without being tied to another country.
- **Standalone script**, separate from the Next.js app. It imports nothing from `src/`.

### How it runs
- The scraper is a **plain Node/TypeScript script**, started with `npm run scrape`. Claude is not part of the run: no API key, no tokens, no per-run cost.
- It runs locally or, later, from cron on the VPS (for example companies and careers weekly, jobs nightly). Each run re-reads the previous JSON, so it is resumable and keeps `firstSeenAt`.
- Claude is only needed to **change** the script: write it, add an ATS adapter, or fix a heuristic when a site changes.
- What the script can't handle lands in `needs-review.json` for manual checking. Adding an LLM pass just for that remainder is a possible later option, but it has a cost and is out of scope here.

### Usage
One-time setup after `npm install`: `npx playwright install chromium`.

```
npm run scrape -- companies          # Joberty → companies.json, joberty-jobs.json (~1.5 min)
npm run scrape -- careers            # careers page / ATS per company → careers.json
npm run scrape -- jobs               # positions → jobs-raw.json, then finalize
npm run scrape -- descriptions       # backfill full job text where it wasn't free → updates jobs.json
npm run scrape -- finalize           # rebuild jobs.json, report.json, needs-review.json only
npm run scrape -- publish            # upsert jobs.json into the Supabase jobs table
npm run scrape -- boards             # remote jobs from public job boards, straight into Supabase (features/job-boards.md)
npm run scrape -- all                # companies, careers, jobs (not descriptions — see below)
npm run jobs:refresh                 # everything, for cron: all, descriptions, publish, boards (see below)

  --company <text>   only companies whose Joberty slug (or, for descriptions, company name)
                      contains this; repeatable; always re-runs them
  --limit <n>        at most n companies (or jobs, for descriptions)
  --force            re-run companies/jobs that already have a recent result
  --no-browser       skip Playwright fallbacks (faster, lower coverage)
  --concurrency <n>  companies in parallel (default 10)
```

### Job descriptions
Every `Job` and `RawJob` carries a `description` field: the full posting text, HTML stripped, capped at 15,000 characters. Where it comes from depends on the source:

- **Free, fetched as part of `jobs`** (same API call, no extra request): Greenhouse (`?content=true` on the list call), Lever, Ashby, Recruitee, Personio, Workable. A re-scrape never loses a previously backfilled description — `finalize` keeps the old value when the new scrape doesn't have one.
- **One extra request per job, via `descriptions`:**
  - SmartRecruiters, Workday, Breezy: each adapter's `fetchDescription()` calls that ATS's own per-job detail endpoint, parsing the company/tenant/board straight out of the job's own `url` (no dependency on `careers.json`).
  - Everything else (`dom`, `network`, `jsonld`, `joberty`, and any ATS without a `fetchDescription`): a generic fallback (`extractJsonLdDescription` / `extractMainContentText` in `scraper/extract/description.ts`) fetches the job's own page and pulls out its schema.org `JobPosting` JSON-LD, or failing that, whichever element looks most like "the description" by class/id, with chrome (breadcrumbs, share buttons, galleries, apply buttons) stripped first.
- `descriptions` only fetches jobs that don't have one yet (skip unless `--force`), so it's cheap to run repeatedly.

Ctrl+C stops after the companies in progress and saves; the next run continues where it stopped. Without `--force`, `careers` skips companies checked in the last 30 days and `jobs` skips companies scraped in the last 12 hours.

### Publishing to Supabase
`publish` copies `jobs.json` into `public.jobs` (migration `supabase/migrations/*_jobs.sql`), one column per `Job` field in snake_case. It reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from `.env.local` and writes with the secret key, because the table has no write policies for `anon` or `authenticated`.

- **Upsert by `id`, nothing is deleted.** `jobs.json` keeps closed jobs with `active: false`, so re-running `publish` closes them in the database too. It is safe to run repeatedly.
- **Public read is limited to `active` rows** by an RLS policy, so closed jobs stay in the table but never reach the site.
- **Cleaned on the way in:** `postedAt` (8 different formats in the data, including Unix seconds) becomes an ISO UTC timestamp, with values that can't be parsed stored as `null`. A `url` that isn't `http(s)` becomes `null`.
- `search_text` is a generated column (`lower(title || ' ' || company_name)`) for a single `ilike` search.
- `description` is plain text. Render it as text, never as HTML.
- **The dashboard sees the new data right away:**
  - After upserting, `publish` (and `boards`) calls `POST $APP_URL/api/jobs/revalidate` with `REVALIDATE_SECRET` (`scraper/revalidate.ts`). That expires the `jobs` cache tag behind the dashboard's `cacheLife("hours")` job list.
  - The call is best-effort. Without the two env vars, or with the app down, it logs and moves on, and the list catches up within the hour.
  - `npm run scrape -- revalidate` does the same on its own.
- **`work_mode`** (`REMOTE` / `HYBRID` / `ON_SITE`, nullable) is computed here, not stored in `jobs.json`: `detectWorkMode()` in `scraper/normalize.ts` reads title, location, `isRemote` and the final description (only final once `descriptions` has run — `publish` is the one stage that sees it). Dashboard UI: [features/dashboard.md](./dashboard.md).

### Keeping it up to date
Each stage's own staleness window (above) means running everything daily isn't wasteful — most companies get skipped automatically, and only new or stale ones are reprocessed. One daily cron entry is enough:

```cron
# every day at 03:17
17 3 * * * cd /path/to/job-manager && npm run jobs:refresh >> scraper/data/cron.log 2>&1
```

`jobs:refresh` (`npm run scrape -- refresh`) runs every step in one process:

1. `companies → careers → jobs`, the same as `all` (`jobs` finalizes on its own at the end).
2. `descriptions`.
3. `publish`.
4. `discover`: finds the ATS boards of companies seen on the job boards. Only companies not checked yet are probed — see [job-boards.md](./job-boards.md#company-careers-2026-10-24).
5. `boards`, last, because it skips postings the scraper already has, read from the fresh `jobs.json` — see [job-boards.md](./job-boards.md).

- **A failing step doesn't stop the rest.** Each step can work from the previous run's files: if Joberty is down, the boards still refresh. The failure is logged, and the process exits 1 so cron records it.
- **Ctrl+C** stops after the step in progress.
- **Setup:** only the Supabase keys in `.env.local` that `publish` and `boards` need. This matches the VPS/Docker hosting already planned in [architecture.md](../project-overview/architecture.md).

- **Closing jobs is automatic.** A job missing from a successful scrape gets `active: false`. A *failed* scrape (site down, timeout) never closes that company's jobs — a transient outage must not look like every position closed.
- **What still needs a human, occasionally (not daily):**
  - Skim the top of `needs-review.json` (sorted by review count, biggest companies first) every so often. A new ATS showing up repeatedly there is worth a dedicated adapter.
  - Glance at `report.json` for a source whose job count suddenly drops to near zero — more often a changed API than closed positions.
  - If Workable starts 429-ing again (its rate limiting is aggressive — see Known limitations), those companies just don't refresh until it clears; nothing to fix.

## Findings (verified 2026-10-22)

**Joberty has a public JSON API with no login.** The site is a React SPA, so its HTML holds no data, but the backend returns it directly:
- `GET https://backend.joberty.com/api/v1/companies/all?page=0&pageSize=24&sort=featured&location=Serbia` returns `{totalPage, totalElements: 1984, items[]}`. Each item already includes **`website`**, plus `id`, `name`, `companyUrlName`, `industry`, `employeeNumber`, `offices[]`, `reviewCount`, `jobCount`. **"List → details → website" becomes ~83 API calls.**
- `pageSize` is capped at 24 (25+ returns `INVALID_PAGE_SIZE`). The filter param is `location`.
- `website` is sometimes missing a scheme (`relio.ch`), sometimes `-`, and sometimes already a careers page (`careers.se.com/serbia`).
- Extra source: `GET /api/v1/jobs?page=0&pageSize=24&location=Serbia` returns ~42 jobs posted on Joberty itself.

**Homepages (sample of 24 large companies):**
- ~70% have a careers link in the static HTML.
- ~5 return empty HTML (FIS, Nordeus, GoDaddy) and need Playwright.
- Keyword matching has false positives (`/devizni-poslovi.html`), so links are scored, not just matched.

**Careers pages (sample of 10):**
- 4 expose an ATS directly in HTML: Zühlke and Synechron → Workday, Insightful → Breezy, Mad Head → TalentLyft.
- **Synechron has a `joblocation` dropdown, but Workday is behind it, so the dropdown never has to be touched.**

**Guessing the ATS slug from the company name works for free:**
- `fivetran` → Greenhouse (166 jobs, including "Novi Sad, Serbia").
- `endava` → SmartRecruiters (`?country=rs` returns 2 jobs, Novi Sad and Belgrade).
- `nordeus` → Greenhouse (11 jobs), even though its homepage returns empty HTML.
- Greenhouse `/v1/boards/{slug}` returns `{name}`, so a guess can be confirmed by name match.

**What doesn't work:** schema.org `JobPosting` JSON-LD practically never appears on job list pages (0/9), so it is not a primary strategy.

**Remote needs careful filtering:** Fivetran lists "Remote, California, United States" and "Remote, Germany, EMEA". Those are **not** in scope.

## Architecture

Each stage reads the previous stage's JSON and writes its own, so any stage can be re-run or resumed after an interruption.

```
[1] Joberty API ──────────────► data/companies.json
[2] website → careers URL ────► data/careers.json      (+ ATS when recognized)
[3] ATS API / HTML / browser ─► data/jobs-raw.json
[4] filter Serbia + remote ───► data/jobs.json  +  data/report.json  +  data/needs-review.json
```

### Stage 1 — Companies (Joberty API)
- Page through `page=0..totalPage-1`, `pageSize=24`, `location=Serbia`, ~1 req/s. Drop base64 image fields (`coverImage`, logo).
- Normalize `website`: add `https://`, drop `-` and empty values. If `website` is already a careers or ATS domain, record that right away.
- In the same run, pull `/api/v1/jobs?location=Serbia` (source `joberty`).
- Risk: the API is unofficial. The fallback is rendering the `IT-companies` page in Playwright.

### Stage 2 — Careers page (stops at the first hit)
1. If `website` is already a careers or ATS URL, use it.
2. **Guess the ATS slug** from `companyUrlName` and the company name (variants: `fivetran`, `fivetran-serbia`, `levi9`, without `-serbia`, `-srbija`, `doo`, `d.o.o.`). Try the public endpoints of Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee and Breezy.
   - A hit counts **only when confirmed:** the board or company name in the ATS response matches the company name, or the company's domain appears in the response.
   - Record `via: "slug_guess"` and a `confidence`.
3. Static `fetch` of the homepage (real User-Agent, 15s timeout). On empty or tiny HTML (<2KB), 403 or 503, fall back to a **Playwright render**.
4. Score every `<a>` with `cheerio` by keywords in `href` and text: `career(s)`, `karijer(a|e)`, `jobs`, `posao`, `poslovi`, `zaposlenje`, `otvorene pozicije`, `join us`, `work with us`, `we're hiring`, `pridruži se`.
   - Negative signals: `pdf`, `wp-content`, `blog`, "devizni poslovi".
   - Bonus: same domain, a `careers.` or `jobs.` subdomain, a known ATS domain.
   - An ATS link already on the homepage is recorded immediately.
5. With no link, try common paths (`/careers`, `/career`, `/jobs`, `/karijera`, `/en/careers`, `/company/careers`) and `sitemap.xml`.
6. If nothing works, record `status: "not_found"`. If several candidates score about the same, record `status: "ambiguous"` and list them all in `needs-review.json`.

### Stage 3 — Extracting positions

**3a. ATS detection on the careers page:**
- A regex table over the HTML: links, `iframe`, `script src`.
- If that misses, Playwright loads the page and **watches network requests**. A request to a known ATS domain reveals `{ats, slug}`. This also catches pages that load jobs with JavaScript.
- One extra hop is allowed, for landing pages with a "See open positions" button.

**3b. ATS adapters (public JSON, free).** Each adapter implements `{ name, match(url) → slug, fetchJobs(slug) → RawJob[] }`:

| ATS | Endpoint |
|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` |
| Lever | `api.lever.co/v0/postings/{slug}?mode=json` |
| Workable | `www.workable.com/api/accounts/{slug}` |
| SmartRecruiters | `api.smartrecruiters.com/v1/companies/{slug}/postings?country=rs` |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{slug}` |
| Recruitee | `{slug}.recruitee.com/api/offers/` |
| Breezy | `{slug}.breezy.hr/json` |
| Personio | `{slug}.jobs.personio.de/xml` |
| Workday | `{tenant}.wdN.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` (POST, paginated, `searchText: "Serbia"`) |
| TalentLyft | widget: `api.talentlyft.com/public/convert/job_ads?companyId={uuid}`; hosted site: `{slug}.talentlyft.com/JobList` (HTML fragment, needs `X-Requested-With: XMLHttpRequest`) |
| BambooHR | `{slug}.bamboohr.com/careers/list` (+ `/careers/{id}/detail` for the description) |
| SuccessFactors | career site ("RMK") `{host}/search/?locationsearch=Serbia&startrow=N` (HTML, 25 per page); slug is the host |
| Teamtailor, iCIMS, Oracle... | added by frequency (see Implementation notes) |

Adapters are written in order of frequency, using the `ats` counts in `report.json` after stages 2 and 3a.

**This solves the country dropdown:** an ATS returns every job with its location, and the script filters for Serbia itself.

**3c. Custom careers page, no LLM** (in order; the first that returns results wins):
1. **Network JSON:** Playwright records XHR/fetch responses. A JSON array of objects with fields like `title`, `name` or `position` (+ `location`, `url`, `slug`) is treated as a job list. Many custom pages call their own API.
2. **`JobPosting` JSON-LD** (rare, but free).
3. **DOM heuristic:**
   - Take links whose `href` contains `/job/`, `/jobs/`, `/position(s)/`, `/opening(s)/`, `/careers/<slug>`, `/oglas/` or `/pozicij*`, and whose text looks like a job title: 2–12 words with words like developer, engineer, inženjer, programer, QA, tester, designer, analyst, manager, lead, architect, devops, data, intern, praksa, support, sales, HR.
   - Read the location from the same card container.
   - Drop generic links (`early-careers`, `experienced-professionals`, `benefits`...).
   - Example: Sixsentix has 11 such links in its static HTML.
4. **Country/location dropdown or filter:** look for `<select>` and listbox elements with options `Serbia`, `Srbija`, `Belgrade`, `Beograd`, `Novi Sad` or `Niš`. Select it, wait for the network to go idle, then repeat steps 1–3. Before that, click "Load more" or "Show all" (at most N times). If the URL changes (e.g. `?country=rs`), save the new URL.
5. If nothing works: `status: "needs_manual"` with the careers URL, listed in `needs-review.json` so only those pages need opening by hand.

### Stage 4 — Normalization and filter
- Map the location to `country` and `isRemote`, using a dictionary of Serbian cities (Beograd/Belgrade, Novi Sad, Niš/Nis, Kragujevac, Čačak, Subotica...) and `Serbia/Srbija/RS`.
- **Keep:** `country === "RS"` OR (remote AND no other country named). "Remote, California, United States" and "Remote, Germany" are dropped. "Remote", "Remote – Europe/EMEA" and "Anywhere" are kept, with `remoteScope`.
- Job `id` is `${source}:${externalId}` (the ATS ID, or a hash of the URL for HTML sources). Dedupe across Joberty and ATS by company plus normalized title.
- Keep `firstSeenAt` and update `lastSeenAt` (from the previous `jobs.json`). A job that disappears gets `active: false`, but **only if that company's scrape succeeded**, so a network error never "deletes" jobs.

## JSON format (`scraper/data/`, gitignored)

Types live in `scraper/types.ts` and are validated with zod on read and write. They are the starting point for the later Supabase tables (`companies`, `jobs`).

```jsonc
// companies.json — Company[]
{ "jobertyId": 77, "name": "Levi9 Technology Services Serbia", "slug": "levi9-technology-services-serbia",
  "website": "https://www.levi9.rs/", "industry": "Software Outsourcing", "employees": "501-1000",
  "offices": ["Belgrade (Serbia)", "Novi Sad (Serbia)"], "reviewCount": 371, "fetchedAt": "..." }

// careers.json — Record<jobertyId, CareersResult>
{ "77": { "status": "found|not_found|ambiguous|error", "careersUrl": "...", "via": "slug_guess|static|browser|path|sitemap",
          "ats": "greenhouse|workday|...|null", "atsSlug": "...", "confidence": 0.9,
          "candidates": [{ "url": "...", "text": "...", "score": 7 }], "error": null, "checkedAt": "..." } }

// jobs.json — Job[] (Serbia + remote only)
{ "id": "greenhouse:123456", "companyJobertyId": 2130, "companyName": "Fivetran Serbia", "title": "...",
  "locationRaw": "Novi Sad, South Bačka, Serbia, EMEA", "country": "RS", "isRemote": false, "remoteScope": null,
  "department": "...", "url": "...", "source": "greenhouse|lever|...|html|network|joberty",
  "postedAt": null, "firstSeenAt": "...", "lastSeenAt": "...", "active": true }
```

- `jobs-raw.json`: every job before filtering, for debugging and tuning the location rules.
- `report.json`: companies by `status` / `via` / `ats`, jobs by `source` / `country`, duration and errors.
- `needs-review.json`: companies with `not_found`, `ambiguous` or `needs_manual`, with links.
- `cache/` (optional): fetched HTML per URL, so parsers can be tuned without downloading again.
- Writes are atomic (tmp file, then rename) and happen every N companies, so an interruption loses little progress.

## Code structure

```
scraper/
  index.ts         CLI: scrape <companies|careers|jobs|all> [--company <slug>] [--limit N] [--force] [--no-browser]
  types.ts         zod schemas + TS types (Company, CareersResult, Job)
  store.ts         reading and atomic writing of JSON in data/
  http.ts          fetch: UA, timeout, retry, per-host throttle, robots.txt
  browser.ts       Playwright chromium, lazy start, 2-3 parallel pages, network response capture
  stages/          companies.ts, careers.ts, jobs.ts
  ats/             detect.ts (regex table), guess.ts (slug guessing + confirmation), registry.ts, one file per ATS
  extract/         network-json.ts, json-ld.ts, dom-heuristic.ts, dropdown.ts
  normalize.ts     location → country / isRemote / remoteScope, filter
```

- New dev dependencies, all free and local: `cheerio`, `playwright` (+ `npx playwright install chromium`), `p-limit`, `tsx`. `zod` is already installed.
- npm script: `"scrape": "tsx scraper/index.ts"`. No env vars, keys or Supabase needed.
- Nothing is imported from `src/`. `src/lib/env.ts` and `src/lib/supabase/admin.ts` use `import "server-only"`, which throws outside Next.
- **Politeness:** at most ~5 companies in parallel, 1 req/s per host, `robots.txt` respected.

## Expected coverage
- **Stage 1:** ~100%.
- **Stage 2:** high for large and mid-size companies (ATS slug + careers link). Companies with <20 employees (~40% of the list) often have no careers page, so `not_found` is the correct outcome.
- **Stage 3:** ATS adapters give reliable, complete data. Heuristics cover part of the custom pages; the rest goes to `needs-review.json`.
- The first full run's `report.json` shows real coverage and decides what's next: more adapters, better heuristics, or a cheap LLM pass for the remainder only.

## Implementation order
1. `types.ts`, `store.ts`, stage 1 → `companies.json` (~1984).
2. Stage 2: slug guessing for the top 3 ATSs and the static careers link. Run on all companies and check `report.json`.
3. Playwright fallback in stage 2, and stage 3a (detection via network requests).
4. ATS adapters by frequency, then stage 4 and `jobs.json`.
5. 3c heuristics (network JSON, DOM, dropdown) and `needs-review.json`.
6. Later, out of scope here: Supabase schema derived from `types.ts`, JSON import, cron on the VPS, UI.

## Verification
- `npm run scrape -- companies`: `companies.json` has ~1984 records, matching the Joberty UI with the Serbia filter.
- Single companies from the sample with known outcomes (`--company <slug>`):
  - `fivetran-serbia` → Greenhouse (slug); "Novi Sad, Serbia" passes the filter, "Remote, California" does not
  - `endava-serbia` → SmartRecruiters (slug), 2 jobs in RS
  - `nordeus` → Greenhouse (slug), despite the empty homepage
  - `zuhlke-serbia` → Workday
  - `insightful` → Breezy
  - `sixsentix` → DOM heuristic, ~11 links
  - `synechron` → Workday, Serbian positions only (compare by hand with their "Serbia" dropdown)
- Re-running without `--force` skips finished companies and creates no duplicates in `jobs.json`; `firstSeenAt` doesn't change.
- Compare 20 random companies from `jobs.json` and `needs-review.json` by hand against their websites.

## Implementation notes
Where the code differs from the plan above, based on testing against the real sites.

- **A guessed ATS board is final only when it lists relevant jobs.** Real but useless boards are common: Bosch and Telesign have empty Workable accounts, and Synechron's SmartRecruiters board only has Swiss and Belgian roles while its main board is Workday. Such a guess is kept as the fallback when the website leads nowhere better.
- **`jobs-raw.json` is per company:** `Record<jobertyId, CompanyScrape>` with status, source, ATS, page URL, raw jobs and error. A failed scrape therefore never closes jobs, and the review list knows why a company is there.
- **Joberty's own postings** are saved to `joberty-jobs.json` by the `companies` stage and merged in `finalize`.
- **Stage 3 writes back to `careers.json`:** an ATS found on a careers page is saved, so the next run calls its API directly.
- **Extra sources added during testing:**
  - a Pinpoint adapter (Decenter);
  - inline JSON in the HTML (`__NEXT_DATA__`, Phenom's `phApp.ddo`, `window.x = {...}`);
  - unwrapping `[{ data: {...} }]` lists in captured JSON.
- **Openings links** may leave the company's domain only behind explicit "open roles" text (Telesign → jobs.proximus.com). Links that already filter to Serbia (`jobs?location=Serbia&regionCode=RS`) are preferred.
- **Blocked sites are reported, not bypassed.** A `robots.txt` that disallows everything (levi9.rs) and bot-protection pages (Akamai "Access Denied" on careers.se.com) end up in `needs-review.json` with the reason.
- **Unreachable websites** (DNS failure, refused connection, timeout) skip the browser, path and sitemap steps. Certificate errors don't count as unreachable, because browsers fetch missing intermediate certificates that Node doesn't.
- **Jobs with no location** are kept only for companies whose Joberty offices are all in Serbia.
- **A network JSON list needs a place or a link, and a missing link is looked up on the page.** An `id` alone doesn't make a list of postings: department lists, blog posts and client testimonials have one too (Kirey's articles, Codeus's quotes and careers-page.com's departments were all published as jobs). `extractNetworkJobs` (`scraper/extract/network-json.ts`) accepts a list only when half its records have a location or link key, or an id that appears in a link on the page. Some job APIs send no link at all (Kula, used by Multiplier: 75 of the 100 jobs that had no URL), so a record without one gets the page link whose href holds its id, else the one whose text is its title. Two different matches count as none, and a title match never makes a list count as jobs. The job's `id` is built from the JSON alone, so finding a link later doesn't change it.
- **The DOM heuristic's location text can pick up a sibling job's own title**, not just real location
  tags: `REMOTE_WORD` (`scraper/extract/dom-heuristic.ts`) matches "remote" anywhere in a card's text
  segments, including inside a neighboring posting's title like "Backend Engineer (Remote)" when the
  climbed card spans the whole list (jobs.cake.com was the case that surfaced this — a real "Remote"
  badge was present, but so were two sibling titles, and `placeJob` then read the sibling titles'
  extra words as "tied to another location" and dropped an otherwise-valid remote posting). Fixed by
  excluding any candidate segment that `looksLikeJobTitle()` matches.
- **A location of just "Hybrid" (no city) was silently dropped.** `isRemote` only looks for `REMOTE`
  (remote/anywhere/wfh/…), which doesn't include "hybrid", so a bare "Hybrid" tag never reached the
  remote branch and fell all the way to the final `keep: false` instead of the "no real location
  named, trust the company's offices" branch below it — the same branch a *blank* location already
  used. Avenga Serbia and DIB Travel Serbia (both Serbia-only offices) were losing real postings this
  way. `placeJob` now computes that "no real place named" leftover once and reuses it for both an
  empty location and a noise-only one like "Hybrid" or "Full-time".
- **`JOB_PATH` only matched an exact `/jobs/`, `/positions/`, etc. segment**, so compound paths like
  `/job-positions/…` (seen on itekako.com, a Webflow site) weren't recognized as job links at all.
  Loosened to allow one hyphenated word on either side of the core word.
- **Re-scan after these fixes (2026-10-22):** `npm run scrape -- jobs --force` across all 932
  companies with a found careers page went from 1283 to **1327 active jobs**, from 261 to **272
  companies**. Per-company pass/fail: `scraper/data/coverage-report.txt` (gitignored, regenerate with
  the same offline pass over `jobs-raw.json` — no network needed to rebuild it).
- **TalentLyft, BambooHR and SuccessFactors adapters (2026-10-23).**
  - **How they were chosen:** the 544 companies with no jobs had their careers pages scanned for job platforms the scraper didn't read. Each platform found was then checked for Serbian postings.
  - **Result:** 122 active jobs that HTML extraction had missed (109 in Serbia, 13 remote), from 17 companies:
    - TalentLyft 65: HTEC, TeleTrader, Ingsoftware, M Plus, SEE Digital, RT-RK, Kim Tec, Saber and others.
    - SuccessFactors 34: ZF, msg global, Atos, Sitel.
    - BambooHR 23: IWConnect, Ibis, Mitto, 3ap.
  - **Active jobs:** 1327 → 1428.
  - **TalentLyft has two shapes:**
    - A widget on the company's own site, detected from `window.tlOptions = { companyId: '…' }` (HTEC, RT-RK). Its slug is that UUID.
    - A site TalentLyft hosts. Its slug is the subdomain.
    - `widget.` is skipped as a slug, and `%2F` is decoded before detection, so "%2Fteletrader" doesn't become subdomain "2Fteletrader".
  - **BambooHR detection only accepts tenant URLs** (`/careers`, `/jobs`, `/js/embed`, `/js/jobs2`, `data-domain="x.bamboohr.com"`). `resources.` and `staticfe.` serve BambooHR's own assets.
  - **SuccessFactors detection** reads the host from the site's own `//<host>/platform/bootstrap/` assets. It replaces the old `career?company=` pattern, whose company id no API takes.
    - Legacy portals (`career55.sapsf.eu/portalcareer`, Wireless Media) aren't covered.
  - **Checked and not worth an adapter yet:**
    - No Serbian postings when checked: JazzHR, Freshteam, Zoho Recruit, Factorial, 50skills, iCIMS (AROBS, Axway, Schneider) and Phenom (Qualtrics).
    - GoHire (Algotech) had one.
    - Not checked: Oracle Cloud (ADI, Belgrade Waterfront, Nexi) and Comeet (Cognyte).
    - A few companies post only on Infostud, HelloWorld or LinkedIn. None of them has a public API.
  - **HTEC's site sometimes answers 504** through Cloudflare. Once a run gets through, the companyId is saved in `careers.json`, and later runs call the API directly.
- **Ctrl+C:** `npm run` turns Ctrl+C into SIGTERM for the script, so both SIGINT and SIGTERM stop it gracefully and save. The script runs as one process (`node --import tsx`), because the `tsx` CLI wrapper killed it before it could save.

### First full run (2026-10-22)
About 50 minutes in total: `companies` ~1.5 min, `careers` ~35 min, `jobs` ~14 min.

| Stage | Result |
|---|---|
| Companies | 1984 (1864 with a website), plus 48 postings on Joberty |
| Careers pages | 932 found (static link 652, ATS guess 78, browser 72, sitemap 63, path 52, website 15); 1022 not found; 30 blocked |
| ATS recognized | 169 (Greenhouse 41, Workday 25, Workable 20, Recruitee 19, Ashby 14, SmartRecruiters 11, Lever 8, Personio 8…) |
| Scrapes | 394 ok, 520 need manual review, 18 errors |
| Jobs before filter | 7471 |
| Active jobs after filter | **1277** from 261 companies: 638 in Serbia, 93 remote, 546 with no location |

**Jobs with no location are the weak spot.** They are kept for companies whose Joberty offices are all in Serbia. Many are genuine: Four Dots, BlueGrid.io and SWANS don't state a city. A few global lists slip through because their JSON location field wasn't recognized: Multiplier (75), IBM Serbia (28). The `country`, `isRemote` and `source` fields make them easy to tell apart.

After adding the `description` field and re-running (`jobs --force` + `descriptions`): **1283 active jobs, 1023 of them (80%) with a description.** The 260 without one: 143 `network`-sourced and 90 `dom`-sourced (best-effort generic page scraping, ~74% hit rate within those two), 23 `joberty` (no real per-job page to visit), 4 `workable` (rate-limited at the time — see below).

### Known limitations
- Enterprise career sites (Phenom, Jibe) page their job lists client-side. Only what loads first is seen: for Telesign's parent Proximus, that is the first 10 global jobs.
- Sites behind bot protection that blocks headless browsers need manual checks.
- The DOM heuristic can mistake careers-section article links with role words in the title for jobs.
- **Workable's Cloudflare rate limiting is aggressive and long:** a short burst of manual testing against it earned a `retry-after` of ~23 hours for this IP. Its adapter and `description` mapping are implemented but effectively untested live; treat its output as lower-confidence until it's been exercised again.
- Network jobs still end up without a URL when the page doesn't link them: Agilcon's Salesforce widget and Clever render cards with no `<a>`, and Adecco's page lists only some of the jobs its API returns. The dashboard shows those titles as plain text.
- Agilcon's API groups offers by country (`jobOffers.Slovenia`, `Croatia`, `Serbia`), and the extractor reads one array without looking at the group name, so countries get mixed. With the stricter list rule the company now ends as `needs_manual`.
- A company whose website is a page on a shared platform (Easy Consult: `careers-page.com/easyconsult-serbia`) gets `/careers` tried on the platform's host, which is the platform's own careers page, with jobs from Sri Lanka and Oman.
- Pinpoint's `description` field name isn't documented publicly and is guessed defensively (`description`/`content`/`summary`); the one Pinpoint board found so far (Decenter) has had zero postings every time it was checked, so this is unverified.
