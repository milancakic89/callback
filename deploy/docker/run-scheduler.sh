#!/usr/bin/env bash
# The scheduler container's command: runs supercronic (or whatever it is given) and hands a stop on to
# a running job refresh.
#
#   run-scheduler.sh supercronic /app/deploy/docker/crontab
#
# On SIGTERM (`docker stop`, `compose down`, a restart of the Mac) supercronic stops scheduling and waits
# for the running jobs, but never tells them to stop: an hour-long refresh would be killed by Docker
# after the grace period instead of finishing the companies it is on and saving. So the stop is handed
# to the refresh script (also one started by hand with `docker compose exec`), which passes it to the
# scraper, and then to supercronic, which leaves once the refresh has. A refresh started by hand is not
# supercronic's child and nothing else waits for it, and Docker kills whatever is left as soon as the
# container's first process ends, so this waits for every such process to be gone before it ends.
#
# STOP_JOB_PATTERN is the pattern (pkill -f) that finds those jobs by their command line; the default is
# the refresh script. Tests give it a pattern of their own, so they never signal each other's processes.
set -uo pipefail

STOP_JOB_PATTERN="${STOP_JOB_PATTERN:-deploy/docker/refresh-jobs-if-due\.sh}"

"$@" &
scheduler_pid=$!

interrupted=false
stop() {
  interrupted=true
  pkill -TERM -f "$STOP_JOB_PATTERN" || true
  kill -TERM "$scheduler_pid" 2>/dev/null || true
  while pgrep -f "$STOP_JOB_PATTERN" >/dev/null; do sleep 0.5; done
}
trap stop TERM INT

status=0
wait "$scheduler_pid" || status=$?
# A signal makes `wait` return at once, with 128 plus its number. Wait again: the scheduler's own exit
# status comes from that one, even if it has already ended.
while [[ "$interrupted" == true ]]; do
  interrupted=false
  status=0
  wait "$scheduler_pid" 2>/dev/null || status=$?
done
exit "$status"
