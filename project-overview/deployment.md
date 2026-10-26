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
| `.github/workflows/deploy.yml` | Lint, build, upload and activate on every push to `main`, or by hand. |
| `deploy/activate-release.sh` | Runs on the server: unpacks the release, repoints `/srv/callback/current`, restarts, checks health, and goes back on failure. |
| `deploy/callback.service` | The systemd unit. The app listens on `127.0.0.1:3000` only. |
| `deploy/Caddyfile` | HTTPS for `callback.rs`, and `www` redirecting to it. |
| `deploy/setup-server.sh` | One-time server setup: Node 24, Caddy, a `deploy` user, the service, the firewall. |

On the server:
```
/srv/callback/
  .env              production environment (written by every deploy, mode 600)
  current -> releases/<git sha>
  releases/         the three newest releases
  incoming/         where the workflow uploads to
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
6. **Deploy.** Push to `main`, or run the workflow by hand (Actions → Deploy → Run workflow). The first run builds, uploads, starts the service, and fails the job if `/api/health` doesn't answer.
7. **Check it.** Open `https://callback.rs`, then sign up and confirm that the activation email arrives and its link opens on `callback.rs`. From your computer, `ssh deploy@<IP> journalctl -u callback -n 50` shows the app's log.

## What a deploy does
1. Installs with `npm ci`, runs `npm run lint`, and builds with the real environment (the build validates it and prerenders pages from the live job list).
2. Packs `.next/standalone` with `public/` and `.next/static` into one archive, and uploads it with the environment over SSH.
3. On the server, unpacks it into `releases/<sha>`, points `current` at it, restarts the service, and waits for `/api/health` (up to about 30 seconds).
4. If that fails, it prints the service log, points `current` back at the previous release, restarts, deletes the failed release and fails the job.
5. Keeps the three newest releases.

`NEXT_DEPLOYMENT_ID` is the commit hash: a browser that still has the previous release open reloads on its next navigation, instead of calling Server Actions that no longer exist.

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
