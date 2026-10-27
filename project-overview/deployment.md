# Callback — Deployment

**Status:** The server is set up and has its HTTPS certificate. The GitHub secrets and the first deploy are still to do, so the workflow has not run yet.
- **Done on the real server** (Contabo, Ubuntu 24.04, x86_64):
  - `deploy/setup-server.sh` ran to the end.
  - `deploy` logs in with the key, and its only `sudo` right is restarting `callback`.
  - Caddy got Let's Encrypt certificates for `callback.rs` and `www.callback.rs`, `www` redirects to the bare domain, and http redirects to https. The app answers 502 until the first deploy.
  - Ports 22, 80 and 443 are open.
- **Tested locally:** the standalone build and server (`node --env-file=... server.js`), `/api/health` with and without a valid environment, and `deploy/activate-release.sh` (first deploy, a healthy deploy, a failed deploy rolling back, keeping three releases) against a fake `systemctl` and health server.
- **Not tested:** the GitHub Actions workflow, end to end.

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
| `deploy/callback.service` | The systemd unit. The app listens on `127.0.0.1:3000` only. |
| `deploy/callback-scraper.timer`, `callback-scraper.service` | The daily job refresh: the timer starts the service every morning, and the service runs `npm run jobs:refresh`. |
| `deploy/update-scraper.sh` | Runs on the server after each deploy: puts the scraper's code and dependencies in `/srv/callback/job-scraper`, and never touches its data. |
| `deploy/Caddyfile` | HTTPS for `callback.rs`, and `www` redirecting to it. |
| `deploy/setup-server.sh` | One-time server setup: Node 24, Caddy, a `deploy` user, the service and the scraper's timer, the firewall. |

On the server:
```
/srv/callback/
  .env              production environment (written by every deploy, mode 600)
  current -> releases/<git sha>
  releases/         the three newest releases
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
   ```
   - Wrap any value containing a space or `#` in double quotes: the build, Node and your editor all read this file.
   - Use a new `AUTH_COOKIE_SECRET` for production rather than the development one.
   - `REVALIDATE_SECRET` is optional ([security.md](./security.md)). Set it, and the same value plus `APP_URL=https://callback.rs` in your local `.env.local`, if you want `npm run scrape -- publish` to refresh the live job list at once.
6. **Deploy.** Push to `main`, or run the workflow by hand (Actions → Test and deploy → Run workflow). The first run builds, uploads, starts the service, and fails the job if `/api/health` doesn't answer.
7. **Check it.** Open `https://callback.rs`, then sign up and confirm that the activation email arrives and its link opens on `callback.rs`. From your computer, `ssh deploy@<IP> journalctl -u callback -n 50` shows the app's log.

## What a deploy does
1. **The `test` job** installs with `npm ci` and runs `npm run lint` and `npm test` ([testing.md](./testing.md)). If either fails, the `deploy` job doesn't start, and nothing is built or uploaded.
2. **The `deploy` job** installs again and builds with the real environment (the build validates it and prerenders pages from the live job list).
3. Packs `.next/standalone` with `public/` and `.next/static` into one archive, and uploads it with the environment over SSH.
4. On the server, unpacks it into `releases/<sha>`, points `current` at it, restarts the service, and waits for `/api/health` (up to about 30 seconds).
5. If that fails, it prints the service log, points `current` back at the previous release, restarts, deletes the failed release and fails the job.
6. Keeps the three newest releases.

`NEXT_DEPLOYMENT_ID` is the commit hash: a browser that still has the previous release open reloads on its next navigation, instead of calling Server Actions that no longer exist.

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

## Hardening the login (after the first deploy works)
`root` can log in with a password from anywhere, and bots try common passwords on every public address. The `deploy` user can't (it has only the key). Once you have confirmed that `ssh deploy@<IP>` works with the key, either choose a long random root password or, better, turn password login off:
```bash
echo 'PasswordAuthentication no' | sudo tee /etc/ssh/sshd_config.d/99-no-passwords.conf
sudo systemctl reload ssh
```
Do it only after a key login works for the account you will use afterwards, in a second terminal kept open: otherwise you lock yourself out (Contabo's control panel has a VNC console as a way back in). `setup-server.sh` leaves SSH's settings alone for that reason.

## Operating it
- **Logs:** `journalctl -u callback -f` (the `deploy` user may read it); Caddy's is `sudo journalctl -u caddy`.
- **Changing a secret:** edit `PRODUCTION_ENV` on GitHub, then run the workflow by hand. The deploy rewrites `/srv/callback/.env`.
- **Rolling back by hand:** `ln -sfn /srv/callback/releases/<older sha> /srv/callback/current && sudo systemctl restart callback`, or revert the commit and push.
- **Moving to another server:** run the setup there, then change `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS` and the DNS records.
- **Security updates:** `unattended-upgrades` is installed by the setup script. Node itself follows NodeSource's 24.x.

## Mail from `callback.rs`
`MAIL_FROM` can stay a Gmail address while you launch, but activation emails sent "from" a domain you own land in spam less often. Any SMTP provider works, because the app only uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASSWORD` (`src/lib/mail.ts`). Whichever one you pick, it gives you SPF, DKIM and DMARC records to add to the `callback.rs` DNS; sending without them is what gets mail flagged.

## Known limits
- **The per-IP limit resets on every restart**, so each deploy clears it ([security.md](./security.md)). The auth limits live in Postgres and survive.
- **`/jobs` is heavy:** about 6.3 MB of HTML before compression (about 0.7 MB gzipped), because the whole job list is embedded, and `/api/jobs/descriptions` is 26 MB before compression. Check the provider's traffic allowance, and compress at Caddy if the gzip from Next is not enough.
- **One server, no redundancy:** while the service restarts during a deploy (a second or two), requests fail. A second instance would also need the shared cache from the [self-hosting guide](../node_modules/next/dist/docs/01-app/02-guides/self-hosting.md).
- **HSTS** (`max-age` of two years, without subdomains) is sent in production: after a first visit over HTTPS, browsers refuse plain HTTP for `callback.rs`.
