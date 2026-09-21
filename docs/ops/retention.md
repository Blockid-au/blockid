# Organisation retention — what the weekly cron deletes (G21 P3-B)

**Shipped:** 2026-09-21. Setting: `/workspace/settings/retention` (organisation owners only) →
`org_settings.retention_days` (migration `0428_benchmark_segments_org_settings.sql`; null = keep everything;
30–3650). Cron: `POST /api/cron/org-retention` — **Sunday 04:40 UTC** (`web/scripts/crontab.production`, row
present, install by hand with `crontab web/scripts/crontab.production`). Code: `web/src/lib/org/retention.ts`.

This is separate from the platform-wide privacy sweep (`/api/cron/privacy-retention`, Monday 03:15 UTC,
`lib/privacy/retention.ts`, Privacy Policy v2.2 § 4) and from account erasure (`erase_account()`,
`docs/ops/db-migrations.md`). It only does what an organisation owner asked for.

## Who is "the organisation"

The `investor_organisations` row (0393) the owner acts for. Its **seats** = `owner_user_id` + every
`investor_organisation_members.user_id`. The org's artefacts are the ones its seats created.

## Exactly what is deleted

For every `org_settings` row with `retention_days` set, rows older than `now − retention_days` in:

| Table | Reached through | Age column | What it is |
|---|---|---|---|
| `cohort_snapshots` | `batch_id` ∈ `evaluation_batches` where `user_id` ∈ seats | `taken_at` | the point-in-time cohort rows behind the Δ column and the Cohort Report movement chart |
| `assessment_overrides` | `batch_id` ∈ the same batches | `created_at` | reviewer overrides recorded on the org's cohorts (the canonical score was never changed by them) |
| `intake_submissions` | `intake_id` ∈ `program_intakes` where `owner_user_id` ∈ seats | `submitted_at` | applications received through the org's `/apply/<slug>` links — founder e-mail, name, startup name, website, deck storage path, coverage |

Bounded: at most **500 rows per table per organisation per run**, oldest first; a longer backlog drains over a
few Sundays (`more: true` in the summary). Deletions are plain `DELETE … WHERE id IN (…)` on the rows found —
no cascade beyond what the schema already defines (`intake_submissions` has none; `cohort_snapshots` and
`assessment_overrides` are leaves).

## What is never touched by this setting

- **Founders' data**: `projects`, `svi_analyses`, `svi_snapshots`, `evaluations`, `evidence*`, `claims`,
  `corrections`, reports, feedback letters. The startup owns its data; the organisation's window does not apply
  to it (`docs/product/score-governance.md`, data principle).
- The cohorts themselves (`evaluation_batches`, `evaluation_batch_items`, `evaluation_batch_members`), intakes
  (`program_intakes`), templates, pilot orders.
- `audit_events` — append-only, hash-chained. Every retention run **adds** one row per organisation
  (`org.retention.applied`: cutoff, counts per table, `more`).
- Anything owned by a user outside the org's seats, even on a shared batch.

## Running it by hand

```sh
# preview (no delete, no audit row)
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://blockid.au/api/cron/org-retention?dry=1" | jq .
# apply with a smaller batch
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "https://blockid.au/api/cron/org-retention?limit=100" | jq .
```

Summary shape: `{ ok, dry_run, now, orgs: [{ org_id, retention_days, cutoff, seats, batches, intakes,
deleted: { cohort_snapshots, assessment_overrides, intake_submissions }, more }], deleted_total, duration_ms }`.
503 until 0428 is applied (`org_settings is missing — apply migration 0428`); cron-health records it.

## Changing the window

Only the organisation owner (`investor_organisations.owner_user_id`, or an explicit `owner` /
`institutional_admin` seat) can set it, and only for an organisation — a non-personal org, a team with ≥ 2
seats, or an owner on a plan with `api.access`. A solo / Free evaluator sees the "for organisations" card. Every
change is recorded (`org.settings.updated`, before → after, actor on the audit row — deliberately no
`updated_by` column, so the erasure map is unchanged). The same page carries the **audit export** switch
(`org_settings.audit_export_enabled`) for `GET /api/org/audit-export.csv`.

## Migration ledger

`0428_benchmark_segments_org_settings.sql` — apply with `scripts/db/apply-migration.sh`, commit the refreshed
`web/content/reports/schema-migrations.json`, then install the two crontab rows (`benchmark-segments` daily
03:25 UTC, `org-retention` Sunday 04:40 UTC).
