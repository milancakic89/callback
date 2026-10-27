#!/usr/bin/env bash
# Runs on the server, as `deploy`, from the GitHub Actions workflow (.github/workflows/deploy.yml,
# job `scraper`):
#   ssh deploy@host bash -s -- <git sha> < deploy/update-scraper.sh
# The workflow has already uploaded $ROOT/incoming/scraper-<sha>.tgz: package.json,
# package-lock.json and scraper/ (without its data). This puts that code where the daily timer
# (callback-scraper.timer) runs it, and never touches scraper/data: that is the scraper's state.
set -euo pipefail

SHA="${1:?usage: update-scraper.sh <git sha>}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "not a git sha: $SHA" >&2; exit 1; }

ROOT="${CALLBACK_ROOT:-/srv/callback}"
DIR="$ROOT/job-scraper"
ARCHIVE="$ROOT/incoming/scraper-$SHA.tgz"
# A run takes about an hour, so a deploy that lands in the middle of one waits up to 90 minutes.
LOCK_WAIT="${LOCK_WAIT:-5400}"

trap 'rm -f "$ARCHIVE"' EXIT
[[ -f "$ARCHIVE" ]] || { echo "missing $ARCHIVE" >&2; exit 1; }

mkdir -p "$DIR/scraper/data"

# A run reads the code and node_modules for up to an hour, so neither may change under it.
# callback-scraper.service takes the same lock.
exec 9>"$DIR/.lock"
flock -w "$LOCK_WAIT" 9 || { echo "a scrape held the lock for ${LOCK_WAIT}s; nothing was changed" >&2; exit 1; }

# New code in, old code out, state kept. The archive never has scraper/data, and extracting it
# couldn't overwrite it anyway.
find "$DIR/scraper" -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} +
tar -xzf "$ARCHIVE" -C "$DIR" --exclude='scraper/data'

cd "$DIR"

# Dependencies only when the lockfile changed (or were never installed): `npm ci` takes a minute or
# two. It is the whole project's, because the scraper's packages (tsx, playwright, cheerio) are dev
# dependencies of it. The copy of the lockfile is written only after a successful install.
if [[ ! -d node_modules ]] || ! cmp -s package-lock.json .installed-package-lock.json; then
  npm ci --include=dev
  cp package-lock.json .installed-package-lock.json
fi

# Chromium, next to the code, where callback-scraper.service looks (a no-op once it is current).
export PLAYWRIGHT_BROWSERS_PATH="$DIR/browsers"
npx playwright install chromium

# Chromium also needs system libraries, which only root can install, once (deployment.md). Without
# them the scraper still runs, minus the pages that need a browser, so this warns and goes on.
if ! launch_output="$(node -e 'require("playwright").chromium.launch().then((browser) => browser.close())' 2>&1)"; then
  echo "WARNING: Chromium doesn't start on this server:" >&2
  echo "$launch_output" | head -n 8 >&2
  echo "As root: $DIR/node_modules/.bin/playwright install-deps chromium" >&2
fi

if [[ -f scraper/data/jobs.json ]]; then
  echo "scraper $SHA is in place"
else
  echo "scraper $SHA is in place, but scraper/data/jobs.json is missing: the timer stays off until the state is copied there (deployment.md)"
fi
