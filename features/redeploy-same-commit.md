# Redeploying the same commit

**Status:** implemented on the branch `fix/redeploy-same-commit`, 2026-11-14. Checked: `deploy/activate-release.sh` by hand against a temporary `CALLBACK_ROOT` with a fake `sudo` and `journalctl` (a first deploy; the same commit under different run ids and attempts, two or more directories and `current` on the last; an existing release directory refused with nothing changed; a malformed id refused, including a bare sha; a failing health check going back to the previous release; only the three newest kept), 92 assertions, all passed; the workflow YAML parses and was read against the steps; `npm test` (134 files, 1261 tests), `npm run lint` and `npx tsc --noEmit` pass. The workflow itself has not run on GitHub yet.

## The problem
On 2026-11-14 `PRODUCTION_ENV` changed (a new Gmail App Password) and the workflow was run by hand, the way [deployment.md](../project-overview/deployment.md) says a secret is changed. Afterwards every Server Action on callback.rs answered 409 `Server Action unavailable.` (`node_modules/next/dist/server/app-render/action-handler.js`), also after a reload. The run built the commit that was already live (`b477fcb`) a second time, and two things went wrong:

1. **The same deployment id for a different build.** Next makes new Server Action ids for every build, but `NEXT_DEPLOYMENT_ID` is the commit hash, so it didn't change. Next's version-skew protection compares deployment ids, saw none, and didn't reload a browser that had a page from the first build; its calls carried ids the new server doesn't know.
2. **Unpacked over the live release.** `deploy/activate-release.sh` unpacks into `releases/<sha>`, the directory the running release already used, without emptying it. The first build's files stayed beside the second's: its JS chunks, and the pages Next rendered at runtime and stored in the release (its file-system cache writes to `.next/server/app`, `node_modules/next/dist/server/lib/incremental-cache/file-system-cache.js`). Those pages point at the first build's chunks and their action ids, so even a fresh load could get them.

A new commit never had either problem: a new hash and a new, empty directory.

## The fix: one id per build
The id is `<commit sha>-<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>`: different for every run and every re-run, and still starts with the commit.

- **`.github/workflows/deploy.yml`** (`deploy` job): `NEXT_DEPLOYMENT_ID` is that id. The archive and the env are uploaded as `incoming/<id>.tgz` and `incoming/<id>.env`, and `activate-release.sh` gets the id instead of the bare hash. The `scraper` job stays keyed by the commit: it has its own directory and runs `npm ci` only when the lockfile changed.
- **`deploy/activate-release.sh`**: takes the id (`^[0-9a-f]{40}-[0-9]+-[0-9]+$`, anything else refused), unpacks into `releases/<id>`, and refuses to start if that directory already exists, so a release is never unpacked over another. Health check, rollback and keeping the three newest stay as they are.
- **`project-overview/deployment.md`**: the layout (`current -> releases/<sha>-<run id>-<attempt>`), the `NEXT_DEPLOYMENT_ID` sentence, the steps of a deploy and the rollback by hand. "Changing a secret" says a rerun now builds a release of its own.

## Checks
- The workflow is YAML only GitHub runs; read it once more against the steps above.
- `activate-release.sh`, by hand as before ([testing.md](../project-overview/testing.md)): a temporary `CALLBACK_ROOT`, a fake `sudo` on `PATH`, `HEALTH_URL` a `file://` path. A first deploy; the same commit deployed twice (two directories, `current` on the second); an existing directory refused; a malformed id refused; a failing health check going back; three releases kept.
- `npm test`, `npm run lint`, `npx tsc --noEmit` still pass (no app code changes).

## Then (by the owner)
Merge and push: the deploy is a new directory with a new deployment id, which also ends today's 409s. Reload the open tab once.
