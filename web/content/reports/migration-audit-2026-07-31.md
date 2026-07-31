# Migration audit — 2026-07-31

Container probed: `supabase-db`
Migrations directory: `web/supabase/migrations/`

## Post-remediation summary

| bucket | count |
| --- | ---: |
| total | 147 |
| applied | 110 |
| partial | 0 |
| missing | 0 |
| data-only | 37 |
| parse_failed | 0 |

`data-only` migrations declare no top-level tables/views/functions — they
are `INSERT … ON CONFLICT`, `ALTER TABLE ADD COLUMN`, or `GRANT` files
whose effect cannot be verified by a schema-object presence check. They
are recorded and skipped, not flagged as missing.

## Pre-remediation summary (first run 12:28:25 UTC)

| bucket | count |
| --- | ---: |
| total | 147 |
| applied | 95 |
| partial | 0 |
| missing | 15 |
| data-only | 37 |
| parse_failed | 0 |

Every one of the 15 was a subject-verb match for the ergonomic gap
described in the task brief — declared but never applied. All 15 are
`CREATE TABLE IF NOT EXISTS` (idempotent), and every FK dependency
(`app_users`, `auth.users`, `projects`, `revocations`) already existed
in the live DB. All 15 were applied via
`docker exec supabase-db psql -f /tmp/mig.sql` in numeric order.
Production returned HTTP 200 after every apply.

## Missing migrations — applied

For each migration below: **status** = decision taken, **declared** =
the top-level objects the migration was supposed to create, **verified
after apply** = the audit re-run confirms every one now exists.

### `0051_founding50_waitlist.sql`
- declared tables: `founding50_waitlist`
- status: **applied** — standalone table, no FK deps.

### `0053_notifications.sql`
- declared tables: `notifications`
- FK deps: `app_users(id)` (exists).
- status: **applied**.

### `0054_investor_access_log.sql`
- declared tables: `investor_access_log`
- status: **applied** — standalone table, no FK deps.

### `0056_proof_infrastructure.sql`
- declared tables: `score_proofs`, `trust_events`
- status: **applied** — both created, no FK deps.

### `0057_brand_settings.sql`
- declared tables: `brand_settings`
- FK deps: `app_users(id)` (exists).
- status: **applied**.

### `0058_advisor_portal.sql`
- declared tables: `advisor_clients`, `advisor_invites`
- FK deps: `app_users(id)` (exists).
- status: **applied**.

### `0059_data_room_checklist.sql`
- declared tables: `data_room_checklist`
- FK deps: `auth.users(id)` (exists).
- status: **applied**.

### `0060_knowledge_base.sql`
- declared tables: `kb_articles`, `kb_exports`, `kb_methodologies`, `kb_research_notes`
- status: **applied** — no FK deps.

### `0061_equity_esop.sql`
- declared tables: `equity_documents`, `equity_members`, `equity_plans`, `equity_vesting_events`, `equity_vesting_schedules`, `esop_pools`
- FK deps: `auth.users(id)` (exists). Prior migration `0023_equity_members.sql` is
  a misnomer — it creates `team_members` + `equity_events`, not `equity_members`,
  so there is no naming collision.
- status: **applied**.

### `0063_data_room_goals_seed.sql`
- declared tables: `data_room_goal_progress`, `data_room_goal_templates`
- FK deps: none. Includes a 30-row `INSERT … ON CONFLICT DO NOTHING` seed.
- status: **applied** — 30 seed rows inserted.

### `0104_app_user_audit_log.sql`
- declared tables: `app_user_audit_log`
- declared functions: `app_user_audit_log_append_only`
- FK deps: `app_users(id)` (exists). Adds append-only triggers.
- status: **applied**.

### `0105_project_members.sql`
- declared tables: `project_members`
- FK deps: `projects(id)`, `app_users(id)` (both exist).
- status: **applied**.

### `0112_compliance_wgea_modern_slavery.sql`
- declared tables: `compliance_modern_slavery_status`, `compliance_wgea_status`
- FK deps: `app_users(id)`, `projects(id)` (both exist).
- status: **applied**.

### `0281_vc_issued.sql`
- declared tables: `vc_issued`
- FK deps: `projects(id)`, `revocations(id)` (both exist — `revocations`
  was created by 0252 which was already applied).
- status: **applied**.

### `0301_upload_scans.sql`
- declared tables: `upload_scans`
- FK deps: `app_users(id)` (exists). Supports `/api/upload` clamd audit trail.
- status: **applied** — table was newer than the previous audit's baseline;
  code path was already deployed and would have started writing to a
  missing table on the next upload.

## Partial migrations

_none_

## Parse failures

_none_

## Parser confidence notes

The parser extracts three object kinds from each migration:

- **tables** — `CREATE [TEMP|UNLOGGED] TABLE [IF NOT EXISTS] [schema.]name`
- **views** — `CREATE [OR REPLACE] [MATERIALIZED|RECURSIVE] VIEW [IF NOT EXISTS] [schema.]name`
- **functions** — `CREATE [OR REPLACE] FUNCTION [schema.]name(`

Comments (`--` and `/* … */`) are stripped before matching, and quoted
identifiers + mixed case are normalised to lower-case unqualified names.

The parser deliberately does **not** track: triggers, types, sequences,
schemas, extensions, policies, indexes, or column additions. Those
either belong to a parent object we already track (a policy is invisible
without its table), or their absence is not a signal that a migration
was never applied (an added column on an existing table is a data-only
edit as far as the schema-object presence check is concerned).

37 of 147 migrations parsed as `data-only` — a straw-poll spot-check
(`0043_missing_tables.sql` → real DDL, `0301_upload_scans.sql` → real
DDL, `0299_seed_sprocketbay_demo_profile.sql` → seed data) confirmed the
classifier is not silently dropping DDL. Every data-only classification
came from a file whose sole effect is `ALTER TABLE ADD COLUMN`, `INSERT
… ON CONFLICT`, `GRANT`, or `CREATE POLICY` — none of which appear as
top-level catalog entries.
