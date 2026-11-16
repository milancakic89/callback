# Feature: Running Callback with Docker Compose (on the owner's Mac)

**Status:** done, 2026-11-16, on the branch `feat/docker-compose`; merged to main and pushed the same day (the VPS still deploys until it shuts down on 2026-11-25). Until the owner moves off the VPS, only the `app` service is to be started; the scheduler waits for the copied scraper state (project-overview/deployment.md). Built and run on the owner's Mac (Docker 28.0.1, arm64), on port 3105 with an empty scraper folder and no scheduler secret; the scraper was never run. The owner's steps are in Not done.
- **Done:**
  - **App image:** `Dockerfile` (`deps`, `build`, `runner`, on `node:24-bookworm-slim`), `.dockerignore`. `.env.local` reaches `next build` only as a BuildKit secret mounted at `/app/.env.local` for that one `RUN`; `APP_URL` and `NEXT_DEPLOYMENT_ID` are build arguments (a real variable beats the file in Next, so the build sees `http://localhost:<port>`, not `https://callback.rs`). The runner is a copy of `.next/standalone`, `public/` and `.next/static`, as `node`, with `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0` and `NODE_OPTIONS=--max-old-space-size=2048`.
  - **Scheduler image:** `deploy/docker/scheduler.Dockerfile` on `mcr.microsoft.com/playwright:v1.64.1-noble` (the version of `package-lock.json`, held by a test), `npm ci`, `scraper/`, `tsconfig.json` and `deploy/docker`, supercronic v0.2.51 pinned by the SHA-256 of both architectures, `TZ=Europe/Belgrade`, as `pwuser`. The scraper imports nothing from `src/`, so no shared module is copied.
  - **Scheduler scripts:** `deploy/docker/crontab` (`*/15` the interviews, `7 * * * *` the refresh check), `expire-interviews.sh`, `refresh-jobs-if-due.sh` (jobs.json, 05:00, `.last-refresh`, the lock, `--force`, `--dry-run`, `timeout 3h`, the date recorded whatever the exit code) and `run-scheduler.sh` (the container's command, see Deviations), each with its test.
  - **`compose.yaml`** (project `callback`): `app` (`env_file: .env.local`, then `APP_URL=http://localhost:${CALLBACK_PORT:-3000}`, `127.0.0.1` port only, a healthcheck on `/api/health`, `init`, `restart: unless-stopped`, `mem_limit: 3g`) and `scheduler` (`APP_URL=http://app:3000`, `TZ`, `./scraper/data` mounted, `depends_on` the app being healthy, `mem_limit: 3g`, `cpus: 2`, `stop_grace_period: 2m`); `secrets.env.file: .env.local`.
  - **Headers:** `src/lib/security-headers.ts` (`isServedOverHttps`, `buildContentSecurityPolicy`, `buildSecurityHeaders`, all taking `NODE_ENV` and `APP_URL` as parameters) with its test; `next.config.ts` calls it. `upgrade-insecure-requests` and HSTS only for a production build whose `APP_URL` is https.
  - **Workflow:** `deploy` and `scraper` have `&& vars.DEPLOY_ENABLED != 'false'` in their `if:`; `test` is unchanged.
  - **Scripts and config:** `compose:up` (`NEXT_DEPLOYMENT_ID=local-<date and time>`, so every `compose:up` rebuilds), `compose:down`, `compose:logs`, `compose:refresh-jobs`; `deploy/**/*.test.ts` in `vitest.config.mts`.
  - **Docs:** the section "Running locally with Docker Compose" in `project-overview/deployment.md` (with the five steps for when the VPS ends), the new rows of its "Pieces" table, `security.md`, `testing.md` and `README.md`.
- **Checks:**
  - **Repository:** `npm test` 179 files, 1,753 tests pass and 11 are skipped (173 files and 1,685 tests before: 6 new files, 79 new tests); `npm run lint` and `npx tsc --noEmit` pass; `npm run build` passes, `/applications` and `/applications/new` are still `◐`, and the build's `routes-manifest.json` headers for the https `APP_URL` in `.env.local` are identical to those of the old inline config. The 11 skipped need `flock` and GNU `timeout`, which macOS doesn't have; run on Linux (in the scheduler image) all 65 tests of `deploy/` pass with none skipped, so GitHub's runner runs all 1,764. No existing test file was changed. Breaking the code on purpose (an `<=` for the 05:00 check, no `.last-refresh` check, no `jobs.json` check, HSTS without the https test, no `--fail`, the secret printed, `DEPLOY_ENABLED` removed from the workflow) made a test fail each time.
  - **Build:** `docker compose config --quiet` is valid; `docker compose build` passes for both services on arm64. The app image is 505 MB on disk (125 MB of compressed content); the scheduler image 4.55 GB on disk (1.15 GB compressed): the Playwright base alone is 3.54 GB, and the rest is the project's `node_modules`. The app's `next build` inside Docker takes about 25 s after a 1 min `npm ci`.
  - **No secret in the images:** `docker history --no-trunc` of both shows no value (only `APP_URL`/`NEXT_DEPLOYMENT_ID` are build arguments, and only in the build stage); the runner's `ENV` has none; `/app/.env.local` does not exist (`cat` fails), and `find` finds no `.env*` file outside `node_modules` in either image. The whole app image filesystem was exported and searched for the value of every variable of `.env.local` (counts per name, never the values): 0 files for every key, secret, password and token. The three that match, `APP_URL`, `SMTP_HOST` and `SMTP_USER`, are values that are also written in the repository's own source (checked: the legal pages, the code's defaults), so they come from the code, not from the secret. A made-up value planted in the export was found by the same search.
  - **Running** (`CALLBACK_PORT=3105`, scheduler with `CRON_SECRET` empty and `SCRAPER_DATA_DIR` an empty folder): `/api/health` answers 200 `{"ok":true}`; the port is bound to `127.0.0.1` only. In Playwright Chromium `/`, `/jobs` and `/sign-in` load (200, styled, the real job list) with no console error, no failed request and no https request, from `localhost` and from `127.0.0.1`, and their responses have no `upgrade-insecure-requests` and no HSTS (the build's `routes-manifest.json` has neither either), with the other headers (CSP, nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options). The app container has `APP_URL=http://localhost:3105`, the scheduler `http://app:3000` and `TZ=Europe/Belgrade`.
  - **The scheduler:** `supercronic -test` says the crontab is valid. The real crontab's `*/15` job ran at 01:30:00 Belgrade time: "CRON_SECRET is not set, nothing to do", job succeeded. A copy with both entries every minute (the refresh as `--dry-run`) ran under supercronic in the container: the interview job "nothing to do", the refresh "skip: no jobs.json". `expire-interviews.sh` with a wrong secret reaches `http://app:3000`, is refused with 404 and fails with curl's 22, which touches nothing. `refresh-jobs-if-due.sh --dry-run`, in the container, in a folder with a made-up `jobs.json`: before 05:00 skips, 05:xx and 16:xx with no run today "would run", already run today skips, no `jobs.json` skips, a held lock skips (also with `--force`), `--force` ignores the hour and the date, and the real clock gives today's Belgrade date and hour; it wrote nothing. With a (fake) refresh running, started by supercronic or by `docker compose exec`, `docker compose stop` gave it its SIGTERM, it saved (it needed a second), logged "stopped before it finished ... not recorded", and the container exited 0 after 1 s.
  - **On the scheduler image (Node 26.13):** `node --import tsx scraper/index.ts --help` loads the scraper; Chromium 156 (Playwright 1.64.1) starts as `pwuser` and opens a page; the scraper's own 91 unit tests pass; `pwuser` can write to the bind-mounted folder, both a scratch one and `./scraper/data` (a probe file, removed at once).
  - **Afterwards:** `docker compose down`; nothing of the project is left running, and port 3000 (the owner's `next dev`) was never used. The two images I built were removed; the Playwright base image (3.54 GB) stays, and the build cache grew by about 3 to 4 GB (`docker builder prune` frees it; kept, because it makes the first `compose:up` fast).
- **Deviations:**
  1. **`run-scheduler.sh` is new.** supercronic waits for a running job on SIGTERM but never passes the signal on (tested: a `docker stop` ran out its whole grace period), so an hour-long refresh would be killed halfway. The container's command is now `run-scheduler.sh supercronic -no-reap crontab`: it hands the stop to a running refresh, including one started by hand with `docker compose exec` (which supercronic doesn't know), waits for it, and passes on supercronic's exit status. Its pattern is `STOP_JOB_PATTERN`, a parameter, so tests never signal each other's processes. `compose.yaml` has `init: true` for the zombies Chromium leaves, which is why supercronic gets `-no-reap`.
  2. **A refresh that was stopped is not recorded** in `.last-refresh` (the plan: recorded whatever the exit code). It was needed once the stop is passed on: a run cut short by a restart would otherwise count as today's, and the catch-up would not finish it. A failed run and a timed-out run are recorded, as planned.
  3. **The plan's reason for the header change does not hold for Chromium.** On `http://localhost` Chrome leaves `upgrade-insecure-requests` alone: a production build with the old headers (checked) loaded `/`, `/jobs` and `/sign-in` with no failed request. It rewrites to https in Safari and, in every browser, on a LAN address, and a browser ignores HSTS that arrives over http, so the change stays and the docs say that, not "breaks localhost".
  4. **`refresh-jobs-if-due.sh` takes settings from the environment** (`REFRESH_DATA_DIR`, `REFRESH_TIME_ZONE`, `REFRESH_START_HOUR`, `REFRESH_TIMEOUT`, `REFRESH_COMMAND`, `REFRESH_TODAY`, `REFRESH_HOUR`), so that its tests run it for real in a temporary folder with a harmless command; the defaults are the plan's. It checks `jobs.json` first, so `--force` also refuses without one.
  5. **`compose:up` sets `NEXT_DEPLOYMENT_ID` in the npm script,** since compose can't make a timestamp: `local-<date and time>`, `local` when `docker compose build` is run directly. Each `compose:up` therefore rebuilds the app, which also picks up a changed `.env.local` (a BuildKit secret does not invalidate the cache).
  6. **Small additions:** `SCRAPER_DATA_DIR` for the data folder; the scheduler runs as `pwuser`; the interview call sends its secret through `curl -H @-`, not its command line; `stop_grace_period` (30 s app, 2 min scheduler); `name: callback`; `.dockerignore` also has `.github`, `.mcp.json`, `*.local.md` (the personal deploy notes have the server's address), `.DS_Store`, `*.tsbuildinfo` and `next-env.d.ts`, and `**/` for the nested ones.
  7. **supercronic's checksum could be fetched,** so there is no deviation there: v0.2.51, and the SHA-256 of both architectures from the release's own downloads, equal to GitHub's asset digests and to the SHA-1 in the release notes.
- **Not done:**
  - **The owner's steps** (deployment.md, "Moving off the VPS"): copy the scraper's state from the VPS, stop its two timers, `npm run compose:up`, set `DEPLOY_ENABLED=false` on GitHub when the VPS ends, build the extension for localhost. Until the state is copied, the scheduler's refresh does nothing and says why.
  - **Never run:** the scraper (`jobs:refresh`), `publish` and the app's revalidate call; `/api/interviews/expire` with the real secret (the local check used an empty one and a wrong one); the 05:07 refresh on the real crontab (checked with an every-minute dry-run copy); a sleeping Mac and its catch-up; mail and Google sign-in (nothing was signed in to).
  - **Not built for amd64,** the architecture of most servers. The Dockerfiles take `TARGETARCH` and the amd64 checksum was checked by download, but no amd64 image was built. For a Linux server, `chown -R 1001:1001 scraper/data` once.
  - **The scheduler image's Node is 26.13** (what the Playwright image ships), where the VPS's scraper ran Node 24. Nothing found: the scraper's tests, `tsx` and Chromium work on it. A `node:24` base with `npx playwright install --with-deps chromium` would match the VPS and be much smaller (the Playwright image carries three browsers), at the cost of a download at build time; not tried.
  - **The GitHub Actions workflow** was not run; the `if:` is held by a test and was read, not executed.
  - **Google sign-in on a port other than 3000** does not work (the OAuth client lists only 3000), so the check ran on 3105.

## Why (the owner)
The VPS (Contabo, [deployment.md](../project-overview/deployment.md)) runs out soon and won't be renewed for now. The owner wants the whole project to run with `docker compose`, from the existing `.env.local`, and the scheduled jobs handled too.

Decisions (agreed 2026-11-16):
- **Where:** on the owner's Mac, at `http://localhost:3000`. No Caddy and no domain. callback.rs is offline until there is a new server. The compose file must not stand in the way of a server later.
- **Scheduled jobs:** in a scheduler container:
  - the interview expiry every 15 minutes;
  - the daily scraper at 05:00 Belgrade time, with a catch-up when the Mac was asleep at 05:00.

## What runs today (on the VPS), and what replaces it
| Today (systemd on the VPS) | In compose |
|---|---|
| `callback.service`: `node server.js` from the standalone build, `127.0.0.1:3000`, heap 2 GB, `MemoryMax=3G` | `app` service, from a multi-stage `Dockerfile`: the standalone build plus `public/` and `.next/static` |
| `Caddyfile`: HTTPS, `encode zstd gzip`, the job-list cache header, `X-Forwarded-For` | Nothing, on localhost. See "Not on localhost" |
| `callback-interviews.timer` + `.service`: `curl -X POST /api/interviews/expire` with `CRON_SECRET`, every 15 min | `scheduler` service, a supercronic job |
| `callback-scraper.timer` + `.service`: `npm run jobs:refresh` daily at 05:00 Europe/Belgrade, `Persistent=true`, a lock, 3 h timeout, state in `scraper/data/*.json` | `scheduler` service, an hourly "is today's run due?" job with a lock, state in `./scraper/data`, bind-mounted |
| Supabase, Cloudflare R2, Gmail SMTP | Unchanged; all outside |

## The files
### `Dockerfile` (the app; multi-stage, `node:24-bookworm-slim`)
1. **`deps`:** `npm ci` from `package.json` and `package-lock.json`. Inside Linux, so `sharp` gets its Linux binary.
2. **`build`:**
   - copy the source;
   - `next build` with the environment of `.env.local` **mounted as a BuildKit secret at `/app/.env.local`** (`RUN --mount=type=secret,id=env,target=/app/.env.local npm run build`). Next reads that file itself, with the same parser as in development, and the secret is never written into an image layer;
   - set `APP_URL` as a build argument and `ENV`. A real environment variable wins over `.env.local` in Next, so the build sees `http://localhost:3000` and not the `https://callback.rs` that `.env.local` holds today;
   - pass `NEXT_DEPLOYMENT_ID` as a build argument too (a timestamp from compose is enough).
3. **`runner`:**
   - copy `.next/standalone`, `public/` and `.next/static`;
   - run as a non-root user with `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0` and `NODE_OPTIONS=--max-old-space-size=2048`;
   - `CMD ["node", "server.js"]`.

### `deploy/docker/scheduler.Dockerfile` (the scheduler; the scraper runs here)
- **Base:** `mcr.microsoft.com/playwright:v1.64.1-noble`, the version in `package-lock.json`, which has Chromium and its system libraries. It adds:
  - `npm ci`, because the scraper needs `tsx`, `playwright` and `cheerio`;
  - `scraper/`, `tsconfig.json` and the shared `src/lib` modules the scraper imports, if any (check);
  - the **supercronic** binary, pinned by version and checksum for the image's architecture (arm64 on an Apple Silicon Mac, amd64 elsewhere).
- **Environment:** `TZ=Europe/Belgrade`.
- **Command:** `supercronic /app/deploy/docker/crontab`.
- **`deploy/docker/crontab`:**
  - `*/15 * * * *` → `deploy/docker/expire-interviews.sh`;
  - `7 * * * *` → `deploy/docker/refresh-jobs-if-due.sh` (every hour at :07).
- **`expire-interviews.sh`:** a POST to `http://app:3000/api/interviews/expire` with `Authorization: Bearer $CRON_SECRET`, through `curl --fail` (or `node -e fetch` if curl is missing).
  - It does nothing when `CRON_SECRET` is unset, like the systemd unit.
  - A failure goes to the scheduler's log.
- **`refresh-jobs-if-due.sh`** (the catch-up):
  - **When it runs:** only when Belgrade's hour is ≥ 5, and `scraper/data/.last-refresh` doesn't hold today's Belgrade date. So the run is at 05:07, or at the first full hour after the Mac wakes.
  - **The lock:** `flock -n scraper/data/.refresh.lock`. A run takes about an hour; the next hourly check sees the lock and leaves.
  - **The run:** `timeout 3h npm run jobs:refresh`.
  - **Afterwards:** it writes today's date to `.last-refresh` whatever the exit code, since a step that failed still lets the others run, as in the systemd unit. It also logs the start, the end and the exit code.
  - **When there is no `scraper/data/jobs.json`:** it does nothing and logs why, like `ConditionPathExists` (a first run from nothing would stamp ~6,700 jobs as first seen today).
- **The scraper's `APP_URL` is `http://app:3000`,** so its revalidate call reaches the app container. The rest comes from `.env.local`.

### `compose.yaml`
- **`app`:**
  - `build` with `secrets: [env]` and the `APP_URL` / `NEXT_DEPLOYMENT_ID` arguments;
  - `env_file: .env.local`, then `environment: APP_URL=http://localhost:${CALLBACK_PORT:-3000}`, which wins over the file;
  - `ports: "127.0.0.1:${CALLBACK_PORT:-3000}:3000"`, loopback only;
  - `healthcheck` on `/api/health`;
  - `restart: unless-stopped` and `mem_limit: 3g`.
- **`scheduler`:**
  - `build` from the scheduler Dockerfile;
  - `env_file: .env.local`, plus `APP_URL=http://app:3000` and `TZ=Europe/Belgrade`;
  - `volumes: ./scraper/data:/app/scraper/data`;
  - `depends_on: app (healthy)`;
  - `restart: unless-stopped`, `mem_limit: 3g` and `cpus: 2`.
- **`secrets.env.file: .env.local`.**
- **Host port 3000:** Google's OAuth client already lists `http://localhost:3000/api/google/callback`. `next dev` uses the same port, so stop it while compose runs, or set `CALLBACK_PORT`. Google sign-in only works on 3000.

### `.dockerignore`
`node_modules`, `.next`, `.git`, `.env*`, `extension/dist`, `extension/store-assets`, `*.zip`, `scraper/data`, `coverage`, `out`. `.env.local` reaches the build only as the secret.

### `next.config.ts` (the one code change)
- **The change:** `upgrade-insecure-requests` (CSP) and `Strict-Transport-Security` only when the site is served over https: production **and** `APP_URL` starting with `https://`.
- **Why:** on `http://localhost` with a production build, `upgrade-insecure-requests` would rewrite the page's own `/_next/...` requests to https.
- **Effect on callback.rs:** none; its `APP_URL` is https.
- **Tests:** add or extend a test of the header builder for both cases. If the headers are inline in `next.config.ts`, move the pure part into a small module with a test, passing `NODE_ENV` and `APP_URL` in as parameters (AGENTS.md).

### `.github/workflows/deploy.yml`
When the VPS is gone, every push to `main` would fail at the SSH step.
- **The change:** the `deploy` and `scraper` jobs get `&& vars.DEPLOY_ENABLED != 'false'` in their `if:`. The `test` job keeps running on every push.
- **The owner's step:** set the repository variable `DEPLOY_ENABLED=false` (Settings → Secrets and variables → Actions → Variables) when the VPS ends. Setting it back to `true` turns deploys on again.
- **Unchanged while the variable is unset:** the workflow behaves as today.

### `package.json` scripts
- `compose:up`: `docker compose up -d --build`
- `compose:down`: `docker compose down`
- `compose:logs`: `docker compose logs -f --tail=200`
- `compose:refresh-jobs`: runs the scraper once by hand, `docker compose exec scheduler deploy/docker/refresh-jobs-if-due.sh --force`. `--force` ignores the date but not the lock.

### Docs
- **`project-overview/deployment.md`:** a new section "Running locally with Docker Compose", with:
  - what runs, and how to start, stop, see the logs and run the scraper by hand;
  - where the state is;
  - the move off the VPS, below.
- **The "VPS expires" steps for the owner, in order:**
  1. **Copy the scraper's state from the VPS** while it still runs. The server's copy is the newer one: `scp -i ~/.ssh/callback_deploy deploy@<IP>:/srv/callback/job-scraper/scraper/data/*.json scraper/data/`.
  2. **On the VPS, stop its timers,** `systemctl disable --now callback-scraper.timer callback-interviews.timer`, so two scrapers never publish at once.
  3. **Start compose:** `npm run compose:up`.
  4. **Turn off deploys:** set `DEPLOY_ENABLED=false` on GitHub.
  5. **Build the extension for localhost:** `CALLBACK_ORIGIN=http://localhost:3000 npm run extension:build`, then reload it.
- **This feature's Status.**

## Not on localhost (so not built now)
- **No Caddy, no HTTPS, no compression.**
- **Rate limits:** `getClientIp` sees no `X-Forwarded-For`, so every visitor counts as `"unknown"`. On one Mac that is one visitor, so it is harmless here, but the app must never be exposed to the internet like this. A later server adds a Caddy service in front, as `deploy/Caddyfile` describes, and nothing else changes.
- **Mail and Google sign-in work.** Links in mails point to `http://localhost:3000`.

## Tests and checks
- **Unit tests:**
  - the header builder (https vs http);
  - the pure parts of `refresh-jobs-if-due` if they are written in TS. A shell script gets a `bash -n` syntax check in a test, or it is written as a small TS module run by `tsx` and tested;
  - no existing test changes.
- **Repo checks:** `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` (the VPS build path must still pass).
- **Docker:**
  - `docker compose config` is valid, and `docker compose build` passes on this Mac (arm64);
  - `docker history` and `docker run … cat /app/.env.local` show no `.env.local` and no secret value in the image.
- **Running it:** use another host port (`CALLBACK_PORT=3105`), because 3000 is the owner's `next dev`, and only if Docker is installed and running. Then check:
  - `/api/health` answers 200;
  - `/`, `/jobs` and `/sign-in` load in Playwright Chromium with no console errors, and the response has no `upgrade-insecure-requests` and no HSTS;
  - the scheduler's log shows the interview job running, and its exit status is 0, or "nothing to do" when the secret is unset.
- **The scraper is not run in this check.** It writes to the production database. `refresh-jobs-if-due.sh` is checked by a dry run (a `--dry-run` flag that prints its decision) for: before 05:00, after 05:00 with no run today, already run today, no `jobs.json`, and lock held.
- **Afterwards:** `docker compose down` after the check, and nothing left running.
