# Deploy runbook — `web/scripts/deploy-live.sh`

**Owner:** G15 Reliability, lane R1 (ship safety) — spec `docs/plans/reliability-2026-09-18.md` § 3 R1.
**House rule:** the server *is* production. No Docker, no GitLab CI, no GitHub Actions — this
script is the whole pipeline. Build from `web/` on `master`, promote an immutable release dir,
verify the live bundle, roll back on any post-swap failure.

```sh
cd /home/dovanlong/blockid.au/web
DEPLOY_NOTE="what shipped" bash scripts/deploy-live.sh          # full pipeline (12 gates)
bash scripts/deploy-live.sh --wait                                 # queue behind a running deploy
bash scripts/deploy-live.sh --quick                                # skip tsc + eslint (emergency only)
bash scripts/deploy-live.sh --skip-build                           # promote the existing standalone build
bash scripts/deploy-live.sh --rollback --dry-run                   # print what a rollback would swap
bash scripts/deploy-live.sh --rollback                             # put the previous release back
```

## G30 implementation checkpoint (22 September 2026)

The approved authority is [G30](../plans/SOURCE-OF-TRUTH.md), especially §12.8 and the implementation ledger. Existing directory isolation does **not** make the current stop/start cutover zero downtime. Parallel serving, drained proxy switching, compatible verified-good selection and dependency freezing remain release gates while W0 work proceeds.

Manual rollback now requires the restored PID to remain alive and HTTP200 within bounded attempts; a failed check logs failure and exits nonzero. This does not yet establish release identity, schema compatibility or external availability. Never infer success from a printed restart command.

Release pruning uses `scripts/cron/g30-release-retention.py` under the deployment flock. Current, previous, last-good, candidate/draining and explicit pins survive the recent-release window. Missing/invalid metadata defers cleanup. The general server-cleanup job no longer deletes `.next-*` directories by age. Root reviews isolated regression evidence before each operations commit; no application restart is needed to activate cron-loaded script fixes.

## 1. The lock — one deploy at a time

* The very first thing the script does is `flock -x -n` on **`/tmp/blockid-deploy.lock`** (fd 200)
  and write its pid to `/tmp/blockid-deploy.pid`. Two sessions racing the build was evidence E1
  (25 failed deploys in 14 days; two of them were sessions clobbering each other's `.next/`).
* **Default = abort.** The refusal prints the holder's pid, its start time (`ps -o lstart=`) and
  the last `Gate N:` line it reached (from `/tmp/blockid-deploy-current.log`, which `gate()`
  appends to). Example:

  ```
  ❌ Another deploy is already running.
     holder pid: 3811045
     started:    Fri Sep 18 04:03:11 2026
     last gate:  2026-09-18T04:03:40Z Gate 7: Next.js production build
     Aborting to avoid a build race. Retry after it finishes, or re-run with --wait to queue behind it.
  ```
* **`--wait`** blocks on the lock instead (`flock -w 1800`, a 30-minute ceiling) and prints the same
  holder summary while it waits. Use it from any automation that must deploy *after* whatever is
  running, never instead of checking why something is running.
* **Never `rm -f /tmp/blockid-deploy.lock`** to "unstick" a deploy: a new `exec 200>` then creates a
  fresh inode that `flock` does not see as conflicting and two builds race. Kill the holder pid
  instead (the trap removes the pid file; the lock releases when the fd closes).
* `web/scripts/qa-live.sh` has the same etiquette on **`/tmp/blockid-live-qa.lock`** (pid in
  `/tmp/blockid-live-qa.pid`, exit 2 on abort, `--wait` with the same ceiling). Two live-QA runs
  sharing `test-results/live-qa/run-state.json` produced false failures — see `docs/ops/live-qa.md`.

### The peer-session lesson (2026-09-16 → 09-18)

Several Claude sessions and cron wrappers (`git-sync-deploy.sh`, `scn-build-agent.sh`,
`self-upgrade-agent.sh`) can all decide to deploy within the same minute. The rules that came out
of the incidents, in order:

1. **If another session is deploying or running live-QA, stop and wait until it is fully done**
   (gate 12 + post-ship review), then run yours — `--wait` implements the waiting, not the judgement.
2. **Never build a tree you did not commit.** A mid-merge tree was built once while the manifest
   claimed master's SHA (the stamp happened at the end) — see § 2.
3. **Serialize, then verify.** After every deploy: review → live-QA → fix, before the next phase.

## 2. Dirty-tree rule + manifest truth

Before **gate 1** the script stamps `web/.deploy-manifest.json` with what it is about to build:

| field | source | notes |
|---|---|---|
| `git_sha` | `git rev-parse HEAD` | frozen at the start; gate 11 verifies the live bundle against it |
| `git_tree_dirty` | `git status --porcelain` minus runtime paths | `true` when any tracked/untracked change exists outside `web/content/`, the manifest itself, `test-results/`, `playwright-report*` (override the filter with `DEPLOY_DIRTY_IGNORE=<ERE>`) |
| `merge_in_progress` | `MERGE_HEAD` / `CHERRY_PICK_HEAD` / `REVERT_HEAD` / `rebase-merge` / `rebase-apply` in the git dir | worktree-aware (`--absolute-git-dir`) |
| `started_at` | script start (UTC) | |
| `deployed_at` | refreshed pre-swap | `""` until the release is about to go live |
| `next_hash` | md5 of `.next/BUILD_ID` | `unknown` until the build exists |
| `task_id` | first `T-…` token in the HEAD commit message, else `manual` | |
| `version` | `content/reports/version.json` | |
| `deploy_pid` | the script's pid | |

* **Refusal:** when `git_tree_dirty` or `merge_in_progress` is `true` the deploy fails *before gate 1*
  (logged as `failed` in `content/reports/deploy-log.jsonl`) and prints the first 10 filtered
  `git status --short` lines so the operator sees why. Commit (or stash) the change and re-run.
* **Override:** `DEPLOY_ALLOW_DIRTY=1` builds anyway; the manifest records the dirty/merge flags so
  the archive and `/api/status` tell the truth about that release.
* The manifest is copied into `releases/<BUILD_ID>/` at the pre-swap refresh — the server's cwd is
  the release dir and `/api/status` + `/api/healthz` read the manifest from cwd. (Before G15 the
  release copy was only refreshed by accident, through a hardlink shared with the archive `cp`.)

## 3. Gate list (numbered dynamically by `gate()`; a full run is 12)

| # | gate | skipped by | failure → |
|---|---|---|---|
| — | pre-gate: manifest stamp + dirty/merge refusal | `DEPLOY_ALLOW_DIRTY=1` (records, does not skip) | abort, nothing built |
| — | debounce: same HEAD deployed < 90 s ago → exit 0 | `DEPLOY_FORCE=1` | — |
| 1 | secret scan (gitleaks) | binary missing → SKIPPED, not a pass | abort |
| 2 | 16 critical env keys present | | abort |
| 3 | Supabase + Redis connectivity | | abort (Redis non-fatal) |
| 4 | `tsc --noEmit` (8 GB heap; a crash is not a pass) | `--quick`, `--skip-build` | abort |
| 5 | ESLint (600 s budget; timeout = unverified = fail) | `--quick`, `--skip-build` | `LINT_BLOCKING=1` aborts, else SKIPPED |
| 6 | vitest, `--retry 0`, JSON reporter → `/tmp/blockid-deploy-vitest.json` → `scripts/test-flake-report.mjs` (top-10 slowest printed; > 5 s / not-passed rows appended to `content/reports/test-flakes.jsonl`) | `--skip-build` | abort |
| 7 | `npm run build` (standalone, webpack) | `--skip-build` (then "existing build found") | abort, backup restored |
| 8 | prepare standalone (static/public/externals/symlinks), integrity guard, freeze `releases/<BUILD_ID>`, temp server on :4099, curl smoke (8 × 200 + 2 redirects + first CSS), e2e smoke tier | | abort, release dir discarded |
| 9 | Supabase query from the new build | | abort |
| — | manifest refresh (`deployed_at`, `next_hash`) + copy into the release dir | | non-fatal |
| 10 | swap: `.next-previous` ← outgoing, kill old pid, start release on :4001, `.next-current` ← release, prune to 6 | | **from here every failure auto-rolls back** |
| 11 | post-deploy verification: local 200, public 200, `/api/auth/me` ok, **live `/api/status.git_sha` == stamped `git_sha`** | | rollback |
| — | Cloudflare + nginx cache purge | | non-fatal |
| 12 | hydrated smoke (Playwright, `tests/e2e/smoke/post-deploy.spec.ts` against https://blockid.au) | | rollback |
| — | archive snapshot → `/data/blockid-releases/<date>-<sha>` (keep 5), deploy-log row, last-good-build.json | | non-fatal |

A gate that did not run is **SKIPPED**, never a pass (`gates: "N/12"` in the JSONL shows it).

## 4. Verify the live bundle

"It deployed" is not evidence. After every deploy, from the server:

```sh
curl -s http://127.0.0.1:4001/api/status | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["version"], d["git_sha"])'
git -C /home/dovanlong/blockid.au rev-parse HEAD                     # must match
cat /home/dovanlong/blockid.au/web/.deploy-manifest.json             # dirty/merge flags must be false
readlink -f /home/dovanlong/blockid.au/web/.next-current             # the release dir that is live
tail -1 /home/dovanlong/blockid.au/web/content/reports/deploy-log.jsonl
```

Gate 11 does the first comparison automatically and rolls back on a mismatch. What it proves: the
process on :4001 runs from the release dir this deploy stamped. What it does **not** prove: that a
`--skip-build` promotion was built from HEAD (the standalone may predate the commit) — for those,
compare `next_hash` against the archive's manifest or just build.

`/api/status.git_sha` is public (like `/api/healthz.git_sha`; the repo is public); the deploy-row
`last_deploy.sha` / `release_id` remain bearer-only.

## 5. Rollback

```sh
bash scripts/deploy-live.sh --rollback --dry-run    # ALWAYS first
bash scripts/deploy-live.sh --rollback
```

The dry run prints the current and previous release ids + manifests and the exact steps, then
exits 0 without taking the lock, signalling a process or touching a symlink. The real rollback
tries three sources in order:

1. **Path A — `.next-previous`** (immutable release dir): kill the live pid, start the previous
   release on :4001, swap `.next-current` / `.next-previous`, curl for 200, append to
   `/tmp/blockid-rollback.log`, Telegram if creds are set.
2. **Path B — `/data/blockid-releases/`** (2nd-newest archive snapshot): same start; does *not*
   update the symlinks.
3. **Path C — legacy `.next-backup`**: restores `web/.next` and starts `standalone/server.js`.

Post-swap gate failures (11, 12) call the same path-A logic automatically (`rollback_after_swap`);
the deploy-log row then carries `rollback: success|failed|unavailable`. If it says `failed`, the
site is down or serving a broken build — run `--rollback` by hand and read `tail -50
/tmp/blockid-production.log`.

## 6. Test determinism (gate 6)

* PDF tests (`src/**/pdf/**`, `*-pdf.test.tsx`, `pdf/route.test.ts`) run in their own vitest
  project with `testTimeout: 20 s` (`web/vitest.config.ts` → `projects`); everything else keeps the
  5 s default. Do not add per-test timeouts; move a slow file into the project instead.
* `node scripts/test-flake-report.mjs /tmp/blockid-deploy-vitest.json [--dry-run]` re-reads the
  last gate-6 report; `content/reports/test-flakes.jsonl` is the ledger to grep when a test starts
  flirting with its timeout.
* Retries stay at 0. A retry hides the bug the gate exists for.

## 7. Files

| path | role |
|---|---|
| `web/scripts/deploy-live.sh` | the pipeline |
| `web/scripts/qa-live.sh` | live-QA runner (own lock) |
| `web/scripts/test-flake-report.mjs` (+ `.test.mjs`) | gate-6 ledger |
| `web/.deploy-manifest.json` | stamped pre-gate, refreshed pre-swap, copied into the release |
| `web/content/reports/deploy-log.jsonl` | one row per run (`success` / `failed`, gates, rollback) |
| `web/content/reports/last-good-build.json` | debounce + LKG baseline |
| `/tmp/blockid-deploy.lock`, `/tmp/blockid-deploy.pid`, `/tmp/blockid-deploy-current.log` | lock, holder, gate progress |
| `/tmp/blockid-deploy-vitest.{log,json}`, `/tmp/blockid-deploy-lint.log`, `/tmp/blockid-deploy-smoke-tier.log` | gate outputs |
| `web/releases/<BUILD_ID>` (→ `/data/releases`), `web/.next-current`, `web/.next-previous` | immutable releases + live/rollback pointers |
| `/data/blockid-releases/<date>-<sha>` | verified-release archive (keep 5) |
