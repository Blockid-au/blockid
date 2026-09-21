# Organisation retention — what the weekly cron deletes (G21 P3-B)

**Shipped:** 2026-09-21. Setting: `/workspace/settings/retention` (organisation owners only) →
`org_settings.retention_days` (migration `0428_benchmark_segments_org_settings.sql`; null = keep everything;
30–3650). Cron: `POST /api/cron/org-retention` — **Sunday 04:40 UTC** (`web/scripts/crontab.production`, row
present, install by hand with `crontab web/scripts/crontab.production`). Code: `web/src/lib/org/retention.ts`.

This is separate from the platform-wide privacy sweep (`/api/cron/privacy-retention`, Monday 03:15 UTC,
`lib/privacy/retention.ts`, Privacy Policy v2.2 § 4) and from account erasure (`erase_account()`,
`docs/ops/db-migrations.md`). It only does what an organisation owner asked for.

## Who is "the organisation"

The `investor_organisations` row (0393) the owner acts for. **The org's artefacts are the cohorts and intake links created for this organisation** — G22-B, migration `0433_org_id_on_batches_intakes.sql` (2026-09-21):

- `evaluation_batches.org_id` / `program_intakes.org_id` = the organisation. The column is stamped at creation from `resolveActingOrg(creator)` (`lib/investor/organisations.ts`: the firm an invited seat acts for, else the creator's own org — the personal org included, it is a real row and matches `evaluation_assessments.org_id`); never from the request body.
- **∪ rows the OWNER account created that still have no `org_id`** — created before 0433 and not yet backfilled — so nothing shipped earlier is orphaned. Backfill: `node web/scripts/org/backfill-org-ids.mjs` (dry-run; `--write` stamps each row with its creator's acting org, never touching a row that already has one).
- Out of scope: a seat holder's own cohorts (created while acting for another organisation, or their personal one) and the owner's cohorts for another organisation. Seat holders can belong to several organisations and own a personal one — P3 post-ship review (2026-09-21).
- Before 0433 is applied the `org_id` filter answers 42703 and the scope is exactly the owner-owned rows (the pre-0433 behaviour).

The same scope (`lib/org/scope.ts` `loadOrgScope`) drives the audit export's resource filter (`lib/org/audit-export.ts` `loadOrgAuditScope(orgId, ownerUserId)`).

## Exactly what is deleted

For every `org_settings` row with `retention_days` set, rows older than `now − retention_days` in:

| Table | Reached through | Age column | What it is |
|---|---|---|---|
| `cohort_snapshots` | `batch_id` ∈ `evaluation_batches` where `org_id` = the org, ∪ `user_id` = the org owner and `org_id IS NULL` | `taken_at` | the point-in-time cohort rows behind the Δ column and the Cohort Report movement chart |
| `assessment_overrides` | `batch_id` ∈ the same batches | `created_at` | reviewer overrides recorded on the org's cohorts (the canonical score was never changed by them) |
| `intake_submissions` | `intake_id` ∈ `program_intakes` where `org_id` = the org, ∪ `owner_user_id` = the org owner and `org_id IS NULL` | `submitted_at` | applications received through the org's `/apply/<slug>` links — founder e-mail, name, startup name, website, deck storage path, coverage |

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
- Anything created for another organisation (or none): a seat holder's own cohorts, the owner's cohorts stamped with a different `org_id`, and anything owned by a user outside the org.

## Running it by hand

```sh
# preview (no delete, no audit row)
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://blockid.au/api/cron/org-retention?dry=1" | jq .
# apply with a smaller batch
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "https://blockid.au/api/cron/org-retention?limit=100" | jq .
```

Summary shape: `{ ok, dry_run, now, orgs: [{ org_id, retention_days, cutoff, seats, batches, intakes,
deleted: { cohort_snapshots, assessment_overrides, intake_submissions }, more }], deleted_total, duration_ms }`
(`seats` = owner accounts in scope, 0 or 1 — kept for the shape; `batches` / `intakes` = the org-scoped counts).
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

`0433_org_id_on_batches_intakes.sql` (G22-B) — `evaluation_batches.org_id` (new) + `program_intakes.org_id`
(column since 0405; FK + index here) → `investor_organisations(id) ON DELETE SET NULL`. Apply, commit the ledger
JSON, then run the backfill: `cd web && node scripts/org/backfill-org-ids.mjs` (counts), then `--write`. Every
reader and both insert paths fall back on 42703 until it is applied. No `app_users` FK → the erasure map is
unchanged.
