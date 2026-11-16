#!/usr/bin/env bash
# Closes the interview invitations nobody answered (features/interview-invitations.md): POST
# /api/interviews/expire on the app, with CRON_SECRET as the bearer token. Started every 15 minutes by
# the scheduler container (deploy/docker/crontab); the same call as deploy/callback-interviews.service.
#
# Environment (all but CRON_SECRET are for tests and for other layouts):
#   CRON_SECRET   the app's secret. Unset or empty: nothing to do, exit 0, like the systemd unit.
#   APP_URL       where the app is; the scheduler container has http://app:3000.
#
# `--fail` makes the app's 404 (a wrong secret) or 500 a failed run: the exit status is curl's 22 and
# the scheduler's log shows it. The secret is sent through stdin (`-H @-`), so it is not on curl's
# command line, where `ps` would show it.
set -euo pipefail

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "expire-interviews: CRON_SECRET is not set, nothing to do"
  exit 0
fi

APP_URL="${APP_URL:-http://app:3000}"
EXPIRE_URL="${APP_URL%/}/api/interviews/expire"

echo "expire-interviews: POST $EXPIRE_URL"
printf 'Authorization: Bearer %s\n' "$CRON_SECRET" |
  curl --fail --silent --show-error --max-time 120 -X POST -H @- "$EXPIRE_URL"
echo
echo "expire-interviews: done"
