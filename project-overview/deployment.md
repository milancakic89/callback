# Callback — Deployment

**Status:** The server is set up and has its HTTPS certificate. The GitHub secrets and the first deploy are still to do, so the workflow has not run yet.
- **Done on the real server** (Contabo, Ubuntu 24.04, x86_64):
  - `deploy/setup-server.sh` ran to the end.
  - `deploy` logs in with the key, and its only `sudo` right is restarting `callback`.
  - Caddy got Let's Encrypt certificates for `callback.rs` and `www.callback.rs`, `www` redirects to the bare domain, and http redirects to https. The app answers 502 until the first deploy.
  - Ports 22, 80 and 443 are open.
- **Tested locally:** the standalone build and server (`node --env-file=... server.js`), `/api/health` with and without a valid environment, and `deploy/activate-release.sh` (first deploy, a healthy deploy, a failed deploy rolling back, keeping three releases) against a fake `systemctl` and health server.
- **Not tested:** the GitHub Actions workflow, end to end.
- **Without the VPS:** the whole project (the app and the two timers' jobs) also runs on one machine with `docker compose`, from `.env.local`: [Running locally with Docker Compose](#running-locally-with-docker-compose), added for when the VPS is not renewed.

The app runs as one Node process on a small VPS, behind Caddy, and GitHub Actions deploys it on every push to `main`.

## Why a VPS
- **The app assumes one long-running Node process behind one reverse proxy** ([security.md](./security.md)): the global per-IP rate limit counts in memory, the job list lives in the server's own cache, and the client IP comes from `X-Forwarded-For`. That rules out serverless hosting.
- **Vercel's free Hobby plan is for non-commercial use only** (per the sources found, not Vercel's own terms page), and Pro is $20/month.
- **Supabase stays where it is.** The server holds no data, so there is nothing to back up on it.

## Which VPS
**Contabo Cloud VPS 4**: 4 vCPU, 8 GB RAM, 100 GB SSD, unlimited traffic (fair use), €5.50/month on a one-month term (€4.40/month effective if paid for 24 months). Region "Hub Europe"; Contabo emails the server's address and the `root` login. (The address is not kept in this repository.)

How it was chosen (prices found on 2026-10-26, and they moved a lot in 2026):
- **OVHcloud VPS-1** (2 vCPU, 4 GB, about €4.49) was the cheapest, but OVH's sign-up has no Serbia in its tax-country list, so an account couldn't be made.
- **Hetzner CX23** (2 vCPU, 4 GB, €5.99) was listed "not available" on 2026-10-23 and raised its prices twice in 2026.
- **Contabo** has a "Country (Tax Purposes Only)" selector, and its Cloud VPS 4 costs about the same as Hetzner with twice the memory and four times the CPU the app needs. Its quality was not looked into.

Sources: [HostingSift's October 2026 comparison](https://dev.to/hostingsift/is-hetzner-still-the-cheapest-vps-we-priced-24-alternatives-october-2026-271g), [Contabo's VPS page](https://contabo.com/en/vps/), [OVHcloud's VPS page](https://www.ovhcloud.com/en/vps/) and [CostGoat's Hetzner calculator](https://costgoat.com/pricing/hetzner).

The server must be **x86_64** with **Ubuntu 24.04** (or Debian 12): the build runs on GitHub's x86 runner and ships its native modules (`sharp`) as they are, and `deploy/setup-server.sh` refuses to run on anything else. Check with `uname -m` and `cat /etc/os-release` after the first login. For an ARM server, change `runs-on` to an ARM runner.

The build happens on GitHub, so the server only runs `node server.js`; its memory and CPU are far more than that needs.

## Pieces
| File | What it is |
|---|---|
| `next.config.ts` | `output: "standalone"`: the build produces a self-contained `.next/standalone` with its own `server.js`. |
| `src/app/api/health/route.ts` | What the deploy checks after a restart. It reads the validated environment at request time, so a release with a missing variable answers 500 (the prerendered pages would still answer 200). |
| `.github/workflows/deploy.yml` | Three jobs. `test` runs the lint and the tests on every push to `main` and on pull requests; `deploy` waits for it, and only on `main` builds, uploads and activates the release; `scraper` runs after `deploy` and ships the scraper's code to the server ([the daily job refresh](#the-daily-job-refresh)). Can also be run by hand. |
| `deploy/activate-release.sh` | Runs on the server: unpacks the release, repoints `/srv/callback/current`, restarts, checks health, and goes back on failure. |
| `deploy/callback.service` | The systemd unit. The app listens on `127.0.0.1:3000` only; V8's heap is capped at 2 GB and the service at 3 GB (`MemoryMax`), see [Compression and limits](#compression-and-limits). |
| `deploy/callback-scraper.timer`, `callback-scraper.service` | The daily job refresh: the timer starts the service every morning, and the service runs `npm run jobs:refresh`. |
| `deploy/update-scraper.sh` | Runs on the server after each deploy: puts the scraper's code and dependencies in `/srv/callback/job-scraper`, and never touches its data. |
| `deploy/Caddyfile` | HTTPS for `callback.rs`, compression (`encode zstd gzip`), the browser cache for the job list and descriptions, and `www` redirecting to it. |
| `deploy/setup-server.sh` | One-time server setup: Node 24, Caddy, a `deploy` user, the service and the scraper's timer, the firewall. |
| `Dockerfile`, `compose.yaml`, `.dockerignore` | The app as a container, and the Compose file that starts it with the scheduler ([Running locally with Docker Compose](#running-locally-with-docker-compose)). |
| `deploy/docker/` | The scheduler container: its `scheduler.Dockerfile`, the `crontab` and the scripts it runs (`expire-interviews.sh`, `refresh-jobs-if-due.sh`, `run-scheduler.sh`), with their tests. |
| `src/lib/security-headers.ts` | The security headers `next.config.ts` sends, with `upgrade-insecure-requests` and HSTS only for a site served over https. |

On the server:
```
/srv/callback/
  .env              production environment (written by every deploy, mode 600)
  current -> releases/<git sha>-<run id>-<attempt>
  releases/         the three newest releases, one directory per build
  incoming/         where the workflow uploads to
  job-scraper/      the daily job refresh: package.json, node_modules, browsers/ (Chromium),
                    scraper/ (the code) and scraper/data/ (its state, gitignored in the repo)
```

## Setting it up
1. **Order the VPS** (Contabo Cloud VPS 4, Ubuntu 24.04, a one-month term, region Europe). Contabo emails the IPv4 address and the `root` login; the password is the one chosen during the order. Never paste it into a chat, a repository or a GitHub secret.
2. **Make a key for GitHub Actions**, on your computer:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/callback_deploy -N "" -C github-actions-callback
   ```
   No passphrase, because the workflow uses it unattended. It can only log in as `deploy`, whose single `sudo` right is restarting the `callback` service.
3. **Set up the server.** Copy the folder over, log in, and run the script as root with the **public** key:
   ```bash
   scp -r deploy root@<IP>:~/deploy
   ssh root@<IP>
   bash ~/deploy/setup-server.sh "ssh-ed25519 AAAA… github-actions-callback"
   ```
   If your provider gives a normal user instead of `root`, log in as that user and put `sudo` in front. The argument is the output of `cat ~/.ssh/callback_deploy.pub` on your computer (one line). The script checks that the server is x86_64 Ubuntu or Debian, then installs Node 24 and Caddy, creates the `deploy` user, installs the service and the Caddyfile, and opens only ports 22, 80 and 443. It is safe to run again.
4. **Point the domain at the server.** In the DNS settings of `callback.rs`, wherever they are:
   - `A` record, name `@`, value the IPv4 address;
   - `A` record, name `www`, the same address (or a `CNAME` to `callback.rs`).

   Don't turn on Cloudflare's proxy (the orange cloud) in front of it: the rate limit would then see Cloudflare's address for everyone ([security.md](./security.md)). Check with `dig +short callback.rs`. Caddy fetches the certificate by itself once the name resolves.
5. **Add the GitHub secrets**, under the repository's Settings → Secrets and variables → Actions:

   | Secret | Value |
   |---|---|
   | `DEPLOY_HOST` | the server's IPv4 address |
   | `DEPLOY_USER` | `deploy` |
   | `DEPLOY_SSH_KEY` | the **private** key: the whole contents of `~/.ssh/callback_deploy` |
   | `DEPLOY_KNOWN_HOSTS` | the output of `ssh-keyscan -t ed25519 <IP>` |
   | `PRODUCTION_ENV` | the production environment, below |

   `PRODUCTION_ENV` is the full contents of an env file, one `NAME=value` per line, as in [.env.example](../.env.example):
   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...
   APP_URL=https://callback.rs
   SMTP_HOST=...
   SMTP_PORT=465
   SMTP_USER=...
   SMTP_PASSWORD="a password with spaces needs quotes"
   MAIL_FROM="Callback <no-reply@callback.rs>"
   AUTH_COOKIE_SECRET=<openssl rand -hex 32>
   REVALIDATE_SECRET=<openssl rand -hex 32>
   R2_ENDPOINT=https://<account-id>.eu.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=callback-storage-document
   ```
   - The four `R2_*` variables are required ([features/document-storage.md](../features/document-storage.md)): `next build` fails without them, so a deploy with an old `PRODUCTION_ENV` stops before anything is shipped. The endpoint is the **EU** one; the plain endpoint answers 403 for a bucket in a jurisdiction. GitHub doesn't show a secret's value, so updating `PRODUCTION_ENV` means pasting the whole file again.
   - Wrap any value containing a space or `#` in double quotes: the build, Node and your editor all read this file.
   - Use a new `AUTH_COOKIE_SECRET` for production rather than the development one.
   - `REVALIDATE_SECRET` is optional ([security.md](./security.md)). Set it, and the same value plus `APP_URL=https://callback.rs` in your local `.env.local`, if you want `npm run scrape -- publish` to refresh the live job list at once.
6. **Deploy.** Push to `main`, or run the workflow by hand (Actions → Test and deploy → Run workflow). The first run builds, uploads, starts the service, and fails the job if `/api/health` doesn't answer.
7. **Check it.** Open `https://callback.rs`, then sign up and confirm that the activation email arrives and its link opens on `callback.rs`. From your computer, `ssh deploy@<IP> journalctl -u callback -n 50` shows the app's log.

## What a deploy does
1. **The `test` job** installs with `npm ci` and runs `npm run lint` and `npm test` ([testing.md](./testing.md)). If either fails, the `deploy` job doesn't start, and nothing is built or uploaded.
2. **The `deploy` job** installs again and builds with the real environment (the build validates it and prerenders pages from the live job list).
3. Packs `.next/standalone` with `public/` and `.next/static` into one archive, and uploads it with the environment over SSH.
4. On the server, unpacks it into a new `releases/<sha>-<run id>-<attempt>`, points `current` at it, restarts the service, and waits for `/api/health` (up to about 30 seconds). If that directory already exists, the script stops before changing anything: a release is never unpacked over another.
5. If that fails, it prints the service log, points `current` back at the previous release, restarts, deletes the failed release and fails the job.
6. Keeps the three newest releases.

`NEXT_DEPLOYMENT_ID` is the release id, `<sha>-<run id>-<attempt>`: one per build, not per commit. A rerun of the same commit is a new deployment, so a browser that still has the previous build open reloads on its next navigation, instead of calling Server Actions that no longer exist. The same id names the release directory and the uploaded files.

## The daily job refresh
`npm run jobs:refresh` (the scraper: companies, careers, jobs, descriptions, publish, discover and the job boards, [job-scraper.md](../features/job-scraper.md#keeping-it-up-to-date)) runs on the server **every day at 05:00 Belgrade time** and takes about an hour. It writes to the same Supabase project the app reads, and, with `APP_URL` and `REVALIDATE_SECRET` in `PRODUCTION_ENV`, tells the app to drop its cached job list at once.

**How it is put together**
- **The release has no scraper in it.** It is a standalone build: no `scraper/`, no `tsx`, no Playwright. So the workflow's `scraper` job, after a successful `deploy`, uploads `package.json`, `package-lock.json` and `scraper/` (never `scraper/data`) with the same SSH key, and `deploy/update-scraper.sh` unpacks them into `/srv/callback/job-scraper`. It runs `npm ci` only when the lockfile changed, and installs Chromium (`PLAYWRIGHT_BROWSERS_PATH=/srv/callback/job-scraper/browsers`). It is a separate job so a problem there never holds back or rolls back a release.
- **A systemd timer, not cron:** `callback-scraper.timer` has `OnCalendar=*-*-* 05:00:00 Europe/Belgrade` and `Persistent=true` (a run missed while the server was off happens at the next boot). It starts `callback-scraper.service`, a `Type=oneshot` unit that runs as `deploy`, reads `/srv/callback/.env`, and has a 3 hour timeout, `Nice=10` and `MemoryMax=3G` so it can't starve the app. The log is in the journal.
- **One lock** (`/srv/callback/job-scraper/.lock`) is held by a run, and by `update-scraper.sh` while it swaps the code and installs. A deploy that lands during a run waits for it, up to 90 minutes, and then fails visibly; a run that starts during an install waits up to 30 minutes.
- **The unit does nothing until `scraper/data/jobs.json` exists** (`ConditionPathExists`). The scraper's state is that JSON: `finalize` takes each job's `firstSeenAt` from the previous `jobs.json`, `publish` writes it to the database as `first_seen_at`, and what a scrape no longer finds is closed from it. A first run from nothing would stamp all of the ~6,700 jobs as first seen today, which ruins the "newest" order. So the state of the machine that has been running the scraper has to be copied over once.

**Setting it up** (the server from [Setting it up](#setting-it-up) already exists; these are the steps for it)
1. **Install the units.** From your computer, copy `deploy/` over again and re-run the setup as root; it is safe to run again, and now also installs the timer and creates `/srv/callback/job-scraper`:
   ```bash
   scp -r deploy root@<IP>:~/deploy
   ssh root@<IP>
   bash ~/deploy/setup-server.sh "ssh-ed25519 AAAA… github-actions-callback"
   ```
   The argument is the same public key as in step 3 of [Setting it up](#setting-it-up).
2. **Push to `main`.** After the deploy, the `scraper` job puts the code in place. Its log shows whether Chromium starts. If it warns, run once, as root on the server (Playwright's own list of system libraries for this OS):
   ```bash
   /srv/callback/job-scraper/node_modules/.bin/playwright install-deps chromium
   ```
3. **Copy the state**, from the repository on the machine that has run the scraper:
   ```bash
   scp -i ~/.ssh/callback_deploy scraper/data/*.json deploy@<IP>:/srv/callback/job-scraper/scraper/data/
   ```
   `jobs.json` has to be there for the timer to run. (`jobs-raw.json` is the largest, about 26 MB.) The server's scraper, not the computer's, should be the only one publishing from then on, or two copies of the state will drift.
4. **Run it once by hand** instead of waiting for the morning, as root on the server, and watch it. `--no-block` is needed: starting a oneshot unit otherwise waits for the whole hour.
   ```bash
   systemctl start --no-block callback-scraper
   journalctl -u callback-scraper -f          # Ctrl+C stops watching, not the run
   ```
   If the journal says "Condition check resulted in … being skipped", `scraper/data/jobs.json` is not there yet.

**Operating it**
- **When it runs next, and the last result:** `systemctl list-timers callback-scraper.timer` and `systemctl status callback-scraper`. A run where a step failed exits 1, and the unit shows `failed`; the other steps still ran ([job-scraper.md](../features/job-scraper.md#keeping-it-up-to-date)).
- **Its log:** `journalctl -u callback-scraper -n 200` (the `deploy` user may read it).
- **A different time:** edit `OnCalendar` in `deploy/callback-scraper.timer`, and copy it to the server and `systemctl daemon-reload` (the setup script does both).
- **Stopping it:** as root, `systemctl disable --now callback-scraper.timer` (and `systemctl stop callback-scraper` for a run in progress: the scraper finishes the companies it is on and saves).
- **Extra settings** for the scraper, such as `HIMALAYAS_API_KEY`, go in `PRODUCTION_ENV` like any other, followed by a deploy.

## Interview invitations
[features/interview-invitations.md](../features/interview-invitations.md) needs four optional variables in `PRODUCTION_ENV`; without them a release still deploys, and the feature is off:
```
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
GOOGLE_TOKEN_KEY=<openssl rand -hex 32>    # encrypts the stored refresh tokens; changing it disconnects every company
CRON_SECRET=<openssl rand -hex 32>         # lets the timer call POST /api/interviews/expire
```
The Google OAuth client's redirect URI is `https://callback.rs/api/google/callback` (and `http://localhost:3000/api/google/callback` for development).

**The timer.** `callback-interviews.timer` starts `callback-interviews.service` 5 minutes after boot and then every 15 minutes. The service is a `Type=oneshot` unit that runs as `deploy`, reads `/srv/callback/.env` and calls `POST http://127.0.0.1:3000/api/interviews/expire` with `Authorization: Bearer $CRON_SECRET`. It does nothing while `CRON_SECRET` is unset, and `curl --fail` makes a wrong secret or a 500 a failed run, which shows in the journal. As with the scraper, re-run the setup as root on the existing server to install the units (it is safe to run again):
```bash
scp -r deploy root@<IP>:~/deploy
ssh root@<IP>
bash ~/deploy/setup-server.sh "ssh-ed25519 AAAA… github-actions-callback"
systemctl list-timers callback-interviews.timer
journalctl -u callback-interviews -n 20
```
Until the timer runs, the screens already read an unanswered invitation past its deadline as "No response"; the timer only makes the database and the company's calendar agree with that.

## Hardening the login (after the first deploy works)
`root` can log in with a password from anywhere, and bots try common passwords on every public address. The `deploy` user can't (it has only the key). Once you have confirmed that `ssh deploy@<IP>` works with the key, either choose a long random root password or, better, turn password login off:
```bash
echo 'PasswordAuthentication no' | sudo tee /etc/ssh/sshd_config.d/99-no-passwords.conf
sudo systemctl reload ssh
```
Do it only after a key login works for the account you will use afterwards, in a second terminal kept open: otherwise you lock yourself out (Contabo's control panel has a VNC console as a way back in). `setup-server.sh` leaves SSH's settings alone for that reason.

## Operating it
- **Logs:** `journalctl -u callback -f` (the `deploy` user may read it); Caddy's is `sudo journalctl -u caddy`.
- **Changing a secret:** edit `PRODUCTION_ENV` on GitHub, then run the workflow by hand. The run builds a release of its own, even for the commit that is already live, and the deploy rewrites `/srv/callback/.env`.
- **Rolling back by hand:** `ln -sfn /srv/callback/releases/<older release> /srv/callback/current && sudo systemctl restart callback`, or revert the commit and push.
- **Moving to another server:** run the setup there, then change `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS` and the DNS records.
- **Security updates:** `unattended-upgrades` is installed by the setup script. Node itself follows NodeSource's 24.x.

## Compression and limits
Added with [features/performance.md](../features/performance.md). Next does not compress anything (`compress: false` in `next.config.ts`); Caddy does, on all four cores, where Next's gzip ran on the one thread that also renders pages.
- **`deploy/Caddyfile`:** `encode zstd gzip` for every response, and `Cache-Control: public, max-age=60, stale-while-revalidate=600` on `/api/jobs/list` and `/api/jobs/descriptions*`. Next sends those with only `s-maxage` and no ETag, which a browser can't use, so it fetched them again on every visit. The header is set with `>` (after the app has answered), over the one Next sends. The job list can lag a minute behind a publish or a scrape in a browser that has it, ten more while it refreshes.
- **`deploy/callback.service`:** `NODE_OPTIONS=--max-old-space-size=2048` and `MemoryMax=3G`. If the process grows past 3 GB systemd restarts the service (`Restart=on-failure`, after 3 s) instead of the kernel's OOM killer choosing a process, which could be Caddy or the scraper.
- **`deploy/callback-scraper.service`:** `CPUQuota=200%`, so the 05:00 refresh leaves the app two of the four vCPUs.
- **`next start` without Caddy** (a local production build) sends everything uncompressed; load tests there (`npm run load:test`, see the performance feature) measure the app, not the compression.

**A manual step after the deploy that adds this.** The deploy workflow ships the app, not `deploy/`: the unit files and the Caddyfile are installed by `setup-server.sh`. On the server, either run `bash deploy/setup-server.sh "<the deploy key's public half>"` again (safe to repeat; it needs the `deploy/` folder copied over), or by hand, as root, from a checkout's `deploy/` folder:
```bash
install -m 644 callback.service /etc/systemd/system/callback.service
install -m 644 callback-scraper.service /etc/systemd/system/callback-scraper.service
install -m 644 Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl restart callback      # picks up NODE_OPTIONS and MemoryMax
```
Then check: `curl -sI -H 'Accept-Encoding: zstd, gzip' https://callback.rs/api/jobs/list` shows `content-encoding: zstd` and the `public, max-age=60` header, and `systemctl show callback -p MemoryMax` shows 3221225472.

## Mail from `callback.rs`
`MAIL_FROM` can stay a Gmail address while you launch, but activation emails sent "from" a domain you own land in spam less often. Any SMTP provider works, because the app only uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASSWORD` (`src/lib/mail.ts`). Whichever one you pick, it gives you SPF, DKIM and DMARC records to add to the `callback.rs` DNS; sending without them is what gets mail flagged.

## Running locally with Docker Compose
Added with [features/docker-compose.md](../features/docker-compose.md), for when the VPS is not renewed: the app, the interview timer and the daily job refresh run on one machine (the owner's Mac) with `docker compose`, at `http://localhost:3000`. callback.rs is offline until there is a new server. Nothing here replaces the VPS setup above; the same files still deploy to one.

**What runs**

| Service | What it is | Replaces |
|---|---|---|
| `app` | The standalone build, from the multi-stage `Dockerfile` (`node:24-bookworm-slim`, a non-root user, `NODE_OPTIONS=--max-old-space-size=2048`, 3 GB cap). Published on `127.0.0.1` only. | `callback.service` |
| `scheduler` | supercronic running `deploy/docker/crontab`, in Playwright's image (Chromium and its libraries), as `pwuser`, with `TZ=Europe/Belgrade`. | `callback-interviews.timer` and `callback-scraper.timer` |
| Supabase, Cloudflare R2, Gmail SMTP | Unchanged, outside. | |
| Caddy | Not there: no domain, no https, no compression on localhost. | `deploy/Caddyfile` |

**Starting it.** Docker Desktop, and the same `.env.local` that `next dev` reads (the variables of [.env.example](../.env.example)). Compose replaces its `APP_URL` (`https://callback.rs` in the owner's file) with the localhost address, for the build and at run time.
```bash
npm run compose:up            # build and start; http://localhost:3000
npm run compose:logs          # follow both logs
npm run compose:down          # stop and remove the containers
npm run compose:refresh-jobs  # run the scraper once by hand, now (it writes to the production database)
docker compose up -d          # start again without rebuilding
```
- **While the VPS still scrapes, start only the app:** `NEXT_DEPLOYMENT_ID=local-try docker compose up -d --build app`. `npm run compose:up` also starts the scheduler, and the Mac's `scraper/data/jobs.json` (from 2026-10-25) is older than the server's. The scheduler would then run a second scraper from that stale state at 05:07, next to the VPS's at 05:00, into the same production database. Start the scheduler only at step 3 of "Moving off the VPS" below, after the state is copied and the VPS's timers are off.
- **`compose:up` rebuilds the app every time** (about two minutes: `npm ci`, then `next build`), because it passes a new `NEXT_DEPLOYMENT_ID` (`local-<date and time>`), which is what makes a browser that has the previous build open reload. A rebuild also picks up a changed `.env.local`, which BuildKit's cache would not notice.
- **Port 3000 is `next dev`'s too.** Stop one of them, or `CALLBACK_PORT=3105 npm run compose:up`. Google sign-in only works on 3000: the OAuth client lists only `http://localhost:3000/api/google/callback` (and `https://callback.rs/...`).
- **The containers restart by themselves** (`restart: unless-stopped`) when Docker Desktop starts, so turn on "Start Docker Desktop when you sign in" if the scheduled jobs should keep running. While the Mac sleeps nothing runs; see the catch-up below.
- **Docker Desktop needs memory for both:** the app is capped at 3 GB and the scheduler at 3 GB and two CPUs (a refresh peaks at about 1.2 GB); Settings, Resources.
- **The secret is not in the images.** The app's build reads `.env.local` as a BuildKit secret mounted for the one `RUN npm run build`, so it is never in a layer, and `.dockerignore` keeps every `.env*` file out of the build context. At run time compose passes it as environment (`env_file`), which `docker inspect` shows to anyone who can run Docker on the machine.

**The scheduler** (`deploy/docker/crontab`, in Belgrade time)
- **`*/15 * * * *` runs `expire-interviews.sh`:** `curl --fail -X POST http://app:3000/api/interviews/expire` with `CRON_SECRET`, as `callback-interviews.service` did. It does nothing while `CRON_SECRET` is unset, and a wrong secret or a 500 is a failed run (`curl`'s exit status 22) in the log. The secret goes to `curl` through stdin, not its command line.
- **`7 * * * *` runs `refresh-jobs-if-due.sh`,** which asks every hour at :07 whether today's refresh is due, and runs `npm run jobs:refresh` only if all of these hold:
  1. `scraper/data/jobs.json` exists (the same reason as the unit's `ConditionPathExists`: a first run from nothing stamps every job as first seen today).
  2. It is 05:00 Belgrade time or later.
  3. `scraper/data/.last-refresh` does not hold today's Belgrade date.
  4. Nobody holds `scraper/data/.refresh.lock` (`flock -n`; a lock goes away with its process, so a killed container leaves none behind).

  So the run is at 05:07, or, when the Mac was asleep then, at the first check after it wakes (the `Persistent=true` of the timer). A run has `timeout 3h`. Afterwards the script writes today's date to `.last-refresh` **whatever the exit code** (a step that failed still lets the others run, as in the unit; it is not tried again until tomorrow) and exits with the run's exit code, so a failed run shows in the log. It logs why it skipped, or the start, the end and the exit code.
- **A stop is passed on.** supercronic waits for a running job on SIGTERM but never tells it to stop, so `run-scheduler.sh` (the container's command) hands the stop to a running refresh, by hand or not, and waits for it. The scraper then finishes the companies it is on and saves, and `docker compose stop` ends in a second or two instead of Docker killing an hour-long run after the grace period (2 minutes). A run that was **stopped is not recorded** in `.last-refresh`, so the next check after the restart goes on with it (the companies with a recent result are skipped).
- **By hand:** `npm run compose:refresh-jobs` is `refresh-jobs-if-due.sh --force` in the scheduler: now, whatever the hour and the date, but still with the lock and `jobs.json`. `--dry-run` prints the decision and runs nothing: `docker compose exec scheduler deploy/docker/refresh-jobs-if-due.sh --dry-run`. To skip today's run, write today's date: `TZ=Europe/Belgrade date +%F > scraper/data/.last-refresh`.
- **The log** of both jobs is the scheduler's: `docker compose logs -f scheduler`.

**Where the state is.** `./scraper/data` on the machine, mounted into the scheduler at `/app/scraper/data` (`SCRAPER_DATA_DIR` changes the folder): the scraper's JSON, and the two small files above. The app keeps nothing; the rest is in Supabase and R2. The folder must be writable by the container's `pwuser` (uid 1001): on Docker Desktop for Mac that just works, on a Linux server `chown -R 1001:1001 scraper/data` once.

**Moving off the VPS** (while it still runs, in this order)
1. **Copy the scraper's state from the VPS.** Its copy is the newer one (the Mac's is old, and a stale `jobs.json` would re-stamp the first-seen dates of the jobs found since):
   ```bash
   scp -i ~/.ssh/callback_deploy deploy@<IP>:/srv/callback/job-scraper/scraper/data/*.json scraper/data/
   ```
   The scheduler then runs a refresh at the first hourly check after 05:00, if none has run today. If the VPS has already run today's, skip it with the `.last-refresh` line above.
2. **Stop the VPS's timers,** so that two scrapers never publish at once, and the interviews are expired by one clock: as root on the VPS, `systemctl disable --now callback-scraper.timer callback-interviews.timer` (and `systemctl stop callback-scraper` if a run is in progress: it saves first).
3. **Start compose:** `npm run compose:up` (with the `next dev` on port 3000 stopped).
4. **Turn off the deploys.** With the VPS gone, every push to `main` would fail at the SSH step. In GitHub, Settings, Secrets and variables, Actions, Variables: add `DEPLOY_ENABLED` with the value `false`. The workflow's `deploy` and `scraper` jobs then skip; `test` still runs on every push. Setting it back to `true` (or deleting it) turns deploys on again, with the secrets as before.
5. **Build the extension for localhost:** `CALLBACK_ORIGIN=http://localhost:3000 npm run extension:build`, then reload it in Chrome ([features/chrome-extension.md](../features/chrome-extension.md)).

**Not on localhost**
- **No Caddy, no https, no compression.** The app is built with `APP_URL=http://localhost:<port>`, so it sends no HSTS and no `upgrade-insecure-requests`. (Over plain http the second makes Safari, and any browser on an address other than localhost, rewrite the page's own `/_next/...` requests to https, which nothing answers; Chromium leaves `localhost` alone, so nothing broke there before either, and a browser ignores HSTS that arrives over http.) callback.rs keeps both: its `APP_URL` is https.
- **The rate limit counts every visitor as `"unknown"`.** `getClientIp` reads the `X-Forwarded-For` that a reverse proxy sets ([security.md](./security.md)), and there is none. That is harmless for one person on one Mac, and the reason the app's port is published on `127.0.0.1` only: **never publish it to a network or the internet like this.**
- **Mail and Google sign-in work.** Links in mails point to `http://localhost:3000`.
- **A new server later:** add a Caddy service in front, as [`deploy/Caddyfile`](../deploy/Caddyfile) describes, and set `APP_URL` to the domain; the headers follow it. Nothing else changes.

## Known limits
- **The per-IP limit resets on every restart**, so each deploy clears it ([security.md](./security.md)). The auth limits live in Postgres and survive.
- **`/jobs` and the job data:** the page itself is about 130 KB (it carries the first 20 rows, not the list), `/api/jobs/list` is 2.9 MB before compression (0.37 MB zstd) and `/api/jobs/descriptions` is 27 MB (6.9 MB zstd), fetched only when a Description filter is used. See [Compression and limits](#compression-and-limits). Check the provider's traffic allowance if the job list grows a lot.
- **One server, no redundancy:** while the service restarts during a deploy (a second or two), requests fail. A second instance would also need the shared cache from the [self-hosting guide](../node_modules/next/dist/docs/01-app/02-guides/self-hosting.md).
- **HSTS** (`max-age` of two years, without subdomains) is sent in production: after a first visit over HTTPS, browsers refuse plain HTTP for `callback.rs`.
