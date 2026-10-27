#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 (or Debian 12) VPS for Callback; see
# project-overview/deployment.md. Copy the deploy/ folder to the server, then as root:
#
#   bash deploy/setup-server.sh "ssh-ed25519 AAAA... github-actions-callback"
#
# The argument is the PUBLIC half of the key GitHub Actions logs in with, as the `deploy` user.
# Safe to run again. It does not touch SSH's own settings (password login stays as the host has it).
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo -i)." >&2; exit 1; }
[[ $# -eq 1 && "$1" == ssh-* ]] || { echo 'Usage: bash setup-server.sh "<ssh public key>"' >&2; exit 1; }

PUBKEY="$1"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

# The workflow builds on an x86_64 runner and ships its native modules (sharp) as they are.
[[ "$(uname -m)" == "x86_64" ]] || { echo "This server is $(uname -m); the deploy needs x86_64 (deployment.md)." >&2; exit 1; }
. /etc/os-release
[[ "$ID" == ubuntu || "$ID" == debian ]] || { echo "Ubuntu or Debian expected, this is $ID." >&2; exit 1; }

# A freshly started server often runs its own updates for a few minutes and holds apt's lock.
apt-get() { command apt-get -o DPkg::Lock::Timeout=300 "$@"; }

apt-get update
apt-get install -y sudo curl ca-certificates gnupg ufw unattended-upgrades \
  debian-keyring debian-archive-keyring apt-transport-https

# Node.js 24, the major the workflow builds with. Ubuntu's own package is too old for Next.js 16.
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

# Caddy, from its own apt repository (the distribution's package is older).
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
    gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# The account the workflow logs in as, and that runs the app. systemd-journal lets it read the
# service's log, which the deploy prints when a release fails its health check.
id deploy &>/dev/null || adduser --disabled-password --gecos "" deploy
usermod -aG systemd-journal deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
grep -qxF "$PUBKEY" /home/deploy/.ssh/authorized_keys || echo "$PUBKEY" >>/home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

install -d -m 755 -o deploy -g deploy /srv/callback /srv/callback/releases
install -d -m 700 -o deploy -g deploy /srv/callback/incoming

install -m 644 "$HERE/callback.service" /etc/systemd/system/callback.service

# The daily job refresh (project-overview/deployment.md, "The daily job refresh"). Its code is shipped
# by the deploy workflow into /srv/callback/job-scraper, and its state (scraper/data) is copied there
# by hand. The timer is safe to enable now: the unit does nothing until that state exists.
install -d -m 755 -o deploy -g deploy /srv/callback/job-scraper /srv/callback/job-scraper/scraper \
  /srv/callback/job-scraper/scraper/data
install -m 644 "$HERE/callback-scraper.service" /etc/systemd/system/callback-scraper.service
install -m 644 "$HERE/callback-scraper.timer" /etc/systemd/system/callback-scraper.timer

systemctl daemon-reload
# Only enabled: there is nothing to run until the first deploy has put a release in place.
systemctl enable callback
systemctl enable --now callback-scraper.timer

# The one thing `deploy` may do as root.
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart callback' >/etc/sudoers.d/callback-deploy
chmod 440 /etc/sudoers.d/callback-deploy
visudo -cf /etc/sudoers.d/callback-deploy

install -m 644 "$HERE/Caddyfile" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

# SSH first, so enabling the firewall can't lock this session out.
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo
echo "Server ready. Next: point callback.rs and www.callback.rs at this server's IP, add the GitHub"
echo "secrets, and push to main (project-overview/deployment.md)."
