# Ops Snapshot Fix — 2026-07-20

## Symptom
Every `deploy-live.sh` run ended with:

    ⚠ /data/blockid-releases not writable — snapshot skipped

meaning the G-11 release archive (5-newest hardlink snapshots for
instant rollback) was never actually written.

## Investigation

    $ df -h /data
    /dev/sdb        295G   17G  263G   6% /data      # plenty of room

    $ ls -ld /data /data/blockid-releases /data/backups
    drwxr-xr-x  21 dovanlong dovanlong  /data
    drwxr-xr-x   2 root      root       /data/blockid-releases   ← BAD
    drwxr-xr-x   2 dovanlong dovanlong  /data/backups            (empty)

    $ whoami; id
    dovanlong (uid 1001, gid 1004)

    $ sudo -n true && echo OK
    OK   # passwordless sudo available

`/data/blockid-releases` was created root-owned on 2026-07-16 (likely
by an earlier bootstrap run under sudo). The deploy script's own
`mkdir -p` no-oped because the dir already existed, then the `[ -w ]`
guard tripped and it took the misleading-warning branch.

## Root cause
Directory ownership — nothing wrong with the deploy script itself.

## Fix
    sudo chown dovanlong:dovanlong /data/blockid-releases

That is the entire root-cause fix. `deploy-live.sh` is unchanged —
its snapshot block already handles a writable dir correctly, and now
the write test passes.

Verified:

    $ touch /data/blockid-releases/.write-test && echo OK
    OK

Next successful deploy will drop `YYYY-MM-DD-<sha>/` into
`/data/blockid-releases/` and prune to 5.

## New: daily backup-verify cron

Added `web/scripts/backup-verify.sh` — runs 18:00 UTC (04:00 AEST):

- Confirms latest `*.sql.gz`, `*.sql`, or `*.dump` under `/data/backups`
  exists and is < 24 h old.
- Confirms a release snapshot dir exists under `/data/blockid-releases/`.
- Appends one line per run to `web/content/reports/backup-health.jsonl`
  (`{ts, db:{latest, ageHours, sizeBytes, ok}, release:{...}}`).
- ALSO writes a mirror row to `cron-health.jsonl` with
  `endpoint:"backup-verify"` and `status:"ok"|"fail"` so the existing
  `cron-alarm.sh` (30-min tick) picks up failures and appends to
  `cron-incidents.jsonl` (Telegram fan-out already wired there).
- Always exits 0 — cron mail is not the alert channel.

Wired via `web/scripts/setup-cron.sh` with marker
`# blockid-cron:backup-verify`. Idempotent re-run confirmed.

## Current backup-health snapshot

First run (2026-07-20T21:43:18Z) reports `db.ok=false` and
`release.ok=false`:

- `/data/backups` is empty — **no `pg_dump` job is currently
  producing dumps.** This is now visible; previously silent.
- `/data/blockid-releases` is empty until the next deploy actually
  succeeds (which will now happen).

Both are expected FAIL rows for the very first tick. The DB row will
stay FAIL until whoever owns the DB dump schedule wires one up — the
alarm will fire nightly through `cron-incidents.jsonl` until then,
which is the whole point.

## Files touched
- `web/scripts/backup-verify.sh` (new, +100 lines)
- `web/scripts/setup-cron.sh` (added one ENTRIES row + chmod +x)
- `web/content/reports/backup-health.jsonl` (bootstrapped with first row)
- `web/content/reports/ops-snapshot-fix-2026-07-20.md` (this file)

No change to `deploy-live.sh` — root cause was filesystem perms, not code.
