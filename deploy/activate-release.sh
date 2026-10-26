#!/usr/bin/env bash
# Runs on the server, as `deploy`, from the GitHub Actions workflow (.github/workflows/deploy.yml):
#   ssh deploy@host bash -s -- <git sha> < deploy/activate-release.sh
# The workflow has already uploaded two files to $ROOT/incoming: the release archive and the
# production env. This unpacks the release, points `current` at it, restarts the service and checks
# that it works, going back to the previous release if it doesn't.
set -euo pipefail

SHA="${1:?usage: activate-release.sh <git sha>}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "not a git sha: $SHA" >&2; exit 1; }

ROOT="${CALLBACK_ROOT:-/srv/callback}"
RELEASE="$ROOT/releases/$SHA"
ARCHIVE="$ROOT/incoming/$SHA.tgz"
ENV_UPLOAD="$ROOT/incoming/$SHA.env"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
KEEP=3

restart() { sudo -n /usr/bin/systemctl restart callback; }

mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
install -m 600 "$ENV_UPLOAD" "$ROOT/.env"
rm -f "$ARCHIVE" "$ENV_UPLOAD"

PREVIOUS="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
ln -sfn "$RELEASE" "$ROOT/current"
restart

# /api/health answers 500 when the environment is invalid; the prerendered pages would say 200.
if curl -fsS --retry 15 --retry-delay 2 --retry-connrefused --max-time 10 -o /dev/null "$HEALTH_URL"; then
  echo "release $SHA is up"
else
  echo "release $SHA failed its health check:" >&2
  journalctl -u callback -n 40 --no-pager >&2 || true
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    echo "going back to $PREVIOUS" >&2
    ln -sfn "$PREVIOUS" "$ROOT/current"
    restart
  fi
  rm -rf "$RELEASE"
  exit 1
fi

# Keep the newest few releases (the previous one is what a rollback needs).
ls -1dt "$ROOT"/releases/*/ | tail -n +$((KEEP + 1)) | xargs -r rm -rf
