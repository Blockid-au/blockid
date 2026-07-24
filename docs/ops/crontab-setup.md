# Crontab setup — trial charge warning

The pre-charge warning email cron (`/api/cron/trial-charge-warning`) is
triggered by the host crontab. The BlockID deploy pipeline deliberately
does **not** touch host crontabs — this is a one-time manual setup step
per host.

## Line to install

```
0 * * * * curl -sS -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/cron/trial-charge-warning > /var/log/blockid-cron.log 2>&1
```

- Runs at the top of every hour.
- Requires the deploy shell to export `CRON_SECRET` (same value as
  `process.env.CRON_SECRET` on the app server).
- Writes JSON summary + errors to `/var/log/blockid-cron.log` — rotate
  with the usual logrotate config for that path.

## Idempotent installer

`scripts/setup-cron-trial-warning.sh` appends the line if not already
present. It exits `0` on either "already there" or "successfully added":

```bash
export CRON_SECRET=<same as server env>
./scripts/setup-cron-trial-warning.sh
```

Confirm the cron with:

```bash
crontab -l | grep trial-charge-warning
```

## Verifying it works

Trigger the endpoint manually from the deploy shell:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://blockid.au/api/cron/trial-charge-warning | jq
```

Expected response shape:

```json
{
  "ok": true,
  "scanned": 0,
  "sent": 0,
  "skipped_no_plan": 0,
  "skipped_email_failed": 0,
  "errors": []
}
```

If `scanned > 0` and `sent == 0`, check `errors` for the reason.

## Related crons

The Stripe `customer.subscription.trial_will_end` webhook (fires at T-3d)
runs a redundant drip through `sendTrialChargeWarning`. The hourly cron
is the primary trigger; the webhook is a safety net.

## Investor weekly digest — `/api/cron/investor-weekly-digest`

Weekly digest for active investors (angel + VC) covering the top-5
watchlisted tickers by SVI movement since the last digest. See
`docs/plans/atlassian-standard-mapping-goal.md` §P7 for the spec.

### Line to install

```
30 22 * * 0 curl -sS -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/cron/investor-weekly-digest >> /var/log/blockid-investor-digest.log 2>&1
```

- Runs Sunday 22:30 UTC (Monday 08:30 AEST — before the working week).
- Requires `CRON_SECRET` in the environment.
- Honours the per-user `email_preferences.weekly_reports` flag; opted-
  out investors are skipped silently.
- Kill switch: set `INVESTOR_DIGEST=off` on the app server env to
  short-circuit the endpoint without touching the crontab.

### Dry-run

Verify the compose step without sending mail:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://blockid.au/api/cron/investor-weekly-digest?skip_email=1" | jq
```

Expected response shape:

```json
{
  "ok": true,
  "investor_count": 42,
  "emailed": 0,
  "failures": 0,
  "dry_run": [
    {
      "investor_id": "…",
      "email": "…",
      "ticker_count": 3,
      "is_empty": false,
      "subject": "Your weekly investor digest — 3 tracked startups moved"
    }
  ]
}
```

An empty `dry_run` array with `investor_count > 0` means every eligible
investor has opted out of `weekly_reports` — expected on fresh
environments.

## Autonomous goal loops

Three long-running goal loops grind unblocked phases from machine-readable
goal files. All three share the reusable driver in
`scripts/cron/goal-loop.mjs` (each wrapper is ~25 lines of parameters).

| Loop            | Wrapper script                             | Goal file                                                | Cadence   | Kill env                    | Status file                          | History JSONL                                                |
| --------------- | ------------------------------------------ | -------------------------------------------------------- | --------- | --------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| reseller        | `scripts/cron/reseller-goal-loop.mjs`      | `docs/plans/reseller-module-goal.md`                     | every 5m  | `RESELLER_AUTONOMOUS_LOOP`  | `/tmp/blockid-reseller-loop.status`  | `web/content/reports/reseller-goal-history.jsonl`            |
| atlassian       | `scripts/cron/atlassian-goal-loop.mjs`     | `docs/plans/atlassian-standard-mapping-goal.md`          | every 10m (offset :07) | `ATLASSIAN_GOAL_LOOP`       | `/tmp/blockid-atlassian-loop.status` | `web/content/reports/atlassian-goal-history.jsonl`           |
| ux-ia           | `scripts/cron/ux-ia-goal-loop.mjs`         | `docs/plans/ux-ia-startup-flow-goal.md`                  | every 10m (offset :03) | `UX_IA_GOAL_LOOP`           | `/tmp/blockid-ux-ia-loop.status`     | `web/content/reports/ux-ia-goal-history.jsonl`               |

Cadence staggering (reseller :00,:05,…; atlassian :07,:17,…;
ux-ia :03,:13,…) means no two loops fire in the same minute — keeps CPU
predictable and avoids `claude` CLI contention. Each entry is wrapped in
`flock -n` against a per-loop lock file so a slow tick never overlaps
itself.

### Reading live state

The admin endpoint `GET /api/admin/goal-loop-status` merges all three
status files into one JSON response (admin-auth only). Shape:

```json
{
  "ok": true,
  "loops": {
    "reseller":  { "loop_label": "reseller-goal-loop",  "current_stage": "tick_end", ... },
    "atlassian": { "loop_label": "atlassian-goal-loop", "current_stage": "tick_end", ... },
    "ux_ia":    { "loop_label": "ux-ia-goal-loop",     "current_stage": "tick_end", ... }
  },
  "generated_at": "2026-07-24T..."
}
```

Loops that have never fired return `null` for that key.

### Kill switches — one-step disable

Each loop honours its kill env. For a **session-only** disable:

```bash
export RESELLER_AUTONOMOUS_LOOP=off
export ATLASSIAN_GOAL_LOOP=off
export UX_IA_GOAL_LOOP=off
```

(Only applies to shells that export the var — cron ignores your shell
env, so this is for manual runs only.)

For a **permanent** disable, comment out the loop's line in
`web/scripts/crontab.production` and re-apply:

```bash
crontab /home/dovanlong/blockid.au/web/scripts/crontab.production
crontab -l | grep -E 'atlassian|ux-ia|reseller'
```

The loops also self-uninstall when their goal file's top-level
`status: done`: on that tick the wrapper writes
`/tmp/blockid-<loop>-goal-done` and calls
`crontab -l | grep -v <wrapper-script>.mjs | crontab -`.

### Dry-run smoke

Every wrapper accepts `--dry-run` — logs one `tick_start` row (with
`dry_run: true`) and exits before dispatching to `claude`:

```bash
node scripts/cron/atlassian-goal-loop.mjs --dry-run
node scripts/cron/ux-ia-goal-loop.mjs --dry-run
```
