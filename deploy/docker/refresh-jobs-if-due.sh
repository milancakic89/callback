#!/usr/bin/env bash
# The daily job refresh (`npm run jobs:refresh`) for the scheduler container, replacing
# deploy/callback-scraper.timer and callback-scraper.service. Started every hour at :07 by
# deploy/docker/crontab, and by hand with --force (`npm run compose:refresh-jobs`).
#
#   refresh-jobs-if-due.sh [--force] [--dry-run]
#
#   --dry-run  print the decision (why it would skip, or the command it would run) and exit: nothing is
#              run and nothing is written. It does try the lock, to tell whether another run holds it.
#   --force    run now, whatever the hour and the date. The lock and the jobs.json check still apply.
#
# It runs the refresh only when ALL of these hold, in this order (the first that fails is the reason):
#   1. scraper/data/jobs.json exists. The scraper's state is that JSON: `finalize` takes each job's
#      firstSeenAt from the previous jobs.json, and a first run from nothing would stamp every one of
#      the ~6,700 jobs as first seen today, which ruins the "newest" order (deployment.md, "The daily
#      job refresh"). Like the unit's ConditionPathExists.
#   2. It is 05:00 Belgrade time or later (START_HOUR), so 05:07 is the usual run.
#   3. scraper/data/.last-refresh does not hold today's Belgrade date: it has not run today. A Mac that
#      was asleep at 05:07 therefore catches up at the first check after it wakes (Persistent=true).
#   4. No other run holds scraper/data/.refresh.lock. A run takes about an hour; the next hourly check
#      finds the lock and leaves.
#
# After a run it writes today's date (the date it started) to .last-refresh whatever the exit code: a
# step that failed still lets the others run, as in the systemd unit, and it is not tried again until
# tomorrow. It exits with the refresh's own exit code, so the scheduler's log shows a failed run.
# One exception: a run that was told to stop (SIGTERM or SIGINT: `docker stop`, the Mac shutting down)
# is not recorded. The scraper saves what it has and the next check, after the restart, goes on with
# the rest (the companies that already have a recent result are skipped).
# Everything is logged to stdout: why it skipped, or the start, the end and the exit code.
#
# Settings (environment; the defaults are what the container uses, the rest is for tests):
#   REFRESH_DATA_DIR     the scraper's data directory            (default: <repository>/scraper/data)
#   REFRESH_TIME_ZONE    the zone "today" and the hour are in    (default: Europe/Belgrade)
#   REFRESH_START_HOUR   the first hour of the day it may run    (default: 5)
#   REFRESH_TIMEOUT      how long a run may take                 (default: 3h, like TimeoutStartSec)
#   REFRESH_COMMAND      what a run executes, in bash            (default: npm run jobs:refresh)
#   REFRESH_TODAY        today's date as YYYY-MM-DD, instead of the clock
#   REFRESH_HOUR         the hour 0-23, instead of the clock
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_DIR="${REFRESH_DATA_DIR:-$ROOT/scraper/data}"
TIME_ZONE="${REFRESH_TIME_ZONE:-Europe/Belgrade}"
START_HOUR="${REFRESH_START_HOUR:-5}"
RUN_TIMEOUT="${REFRESH_TIMEOUT:-3h}"
RUN_COMMAND="${REFRESH_COMMAND:-npm run jobs:refresh}"
STATE_FILE="$DATA_DIR/.last-refresh"
LOCK_FILE="$DATA_DIR/.refresh.lock"

force=false
dry_run=false
for argument in "$@"; do
  case "$argument" in
    --force) force=true ;;
    --dry-run) dry_run=true ;;
    *)
      echo "usage: refresh-jobs-if-due.sh [--force] [--dry-run]" >&2
      exit 2
      ;;
  esac
done

log() { echo "refresh-jobs: $*"; }

today="${REFRESH_TODAY:-$(TZ="$TIME_ZONE" date +%F)}"
hour="${REFRESH_HOUR:-$(TZ="$TIME_ZONE" date +%H)}"
[[ "$today" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "not a date: $today" >&2; exit 2; }
[[ "$hour" =~ ^[0-9]{1,2}$ ]] || { echo "not an hour: $hour" >&2; exit 2; }
# `10#` because "08" and "09" are not octal numbers.
hour=$((10#$hour))

skip() {
  log "skip: $*"
  exit 0
}

if [[ ! -f "$DATA_DIR/jobs.json" ]]; then
  skip "no jobs.json in $DATA_DIR. Copy the scraper's state there first (project-overview/deployment.md)"
fi

if [[ "$force" == false ]]; then
  if ((hour < START_HOUR)); then
    skip "it is $(printf '%02d' "$hour"):xx in $TIME_ZONE, before $(printf '%02d' "$START_HOUR"):00"
  fi
  last_refresh="$(cat "$STATE_FILE" 2>/dev/null || true)"
  if [[ "$last_refresh" == "$today" ]]; then
    skip "already ran today ($today)"
  fi
fi

# Held until this script ends: a lock on the file descriptor goes away with the process, so a killed
# container never leaves a stale lock behind.
command -v flock >/dev/null || { echo "refresh-jobs: flock (util-linux) is not installed" >&2; exit 1; }
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  skip "another run holds the lock ($LOCK_FILE)"
fi

if [[ "$dry_run" == true ]]; then
  log "dry-run: would run: $RUN_COMMAND (today $today, hour $(printf '%02d' "$hour"), force $force)"
  exit 0
fi

cd "$ROOT"
log "start: $RUN_COMMAND (today $today, force $force, timeout $RUN_TIMEOUT)"

# In the background, so that a `docker stop` (SIGTERM to this script) can be handed on to the run: the
# scraper then finishes the companies it is on and saves, instead of being killed halfway. `timeout`
# passes a signal to its whole process group, which is npm, node and Chromium.
timeout --kill-after=2m "$RUN_TIMEOUT" bash -c "$RUN_COMMAND" &
run_pid=$!
stopped=false
interrupted=false
stop() {
  stopped=true
  interrupted=true
  kill -TERM "$run_pid" 2>/dev/null || true
}
trap stop TERM INT

status=0
wait "$run_pid" || status=$?
# A signal makes `wait` return at once, with 128 plus its number. Wait again, for the run to finish
# saving: the run's own exit status comes from that one, even if it has already ended.
while [[ "$interrupted" == true ]]; do
  interrupted=false
  status=0
  wait "$run_pid" 2>/dev/null || status=$?
done
trap - TERM INT

if [[ "$stopped" == true ]]; then
  log "end: stopped before it finished (exit code $status), not recorded: the next check goes on with it"
  exit "$status"
fi

# Written whatever the exit code (see above), by writing a new file and renaming it.
printf '%s\n' "$today" >"$STATE_FILE.tmp"
mv "$STATE_FILE.tmp" "$STATE_FILE"

log "end: exit code $status (recorded $today in .last-refresh)"
exit "$status"
