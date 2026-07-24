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
