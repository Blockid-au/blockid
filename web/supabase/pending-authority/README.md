# SQL applied live, source outside `migrations/` until the schema-authority transition

`deploy-live.sh` / `g30-serving-state.py` bind every release to a `schemaDigest`
over the migration file list (`content/reports/schema-migrations.json`). A new file
in `supabase/migrations/` changes that digest, and warm rollback across differing
digests is refused except for the sealed 0447 transition. Until the G30
schema-authority controller admits a general additive transition, additive SQL that
is safe for every retained release is applied directly (one transaction, psql) and
kept here with its evidence. Move a file into `migrations/` only together with the
authority transition that admits it.

| File | Applied live | Evidence |
|---|---|---|
| `0460_audit_chain_serialized_ids.sql` | 24/09/2026 (G33-T08) | `docs/reviews/2026-09-24-g33-t16-s2-live.md` |
| `0461_report_revisions.sql` | 23/09/2026 (as 0410, G30); source restored 24/09 (G33-T10) | live catalog matched column-for-column 24/09 |
| `0462_analyses_project_id.sql` | 25/09/2026 (G34 DC01 / AF13), additive nullable FK + partial index | live catalog: `analyses.project_id uuid NULL`, `analyses_project_created_idx`; `docs/reviews/2026-09-25-analyze-upload-failure-review.md` |
| `0463_evaluations_founder_project_id.sql` | 25/09/2026 (G34 DC05), additive nullable FK + partial index | live catalog: `evaluations.founder_project_id` |
| `0464_erase_account_email_preferences_notifications.sql` | 25/09/2026 (G34 DC09), `erase_account()` = 0442 + 2 non-FK extras | live def contains email_preferences/svi_notifications extras; dry-run inside ROLLBACK listed both |
| `0465_email_sends.sql` | 25/09/2026 (G34 BT2 EM02–EM05) | live: `email_sends` table; `email_preferences` suppression + consent columns; commercial category defaults now false |
| `0466_email_drips_lifecycle_campaigns.sql` | 25/09/2026 (G34 BT4), campaign CHECK = previous 12 + 9 lifecycle ids | live constraint contains `sunset_check`; existing rows unaffected |
| `0467_erase_account_email_sends.sql` | 25/09/2026 (G34 BT2 follow-up), `erase_account()` = 0464 + key kind `email_sha256` + `email_sends` extra | dry-run inside ROLLBACK listed email_sends rows; SQL hash = lib/email-sends hashRecipient |
| `0471_privacy_v2_4_registry.sql` | 26/09/2026 (APP 1.7 privacy v2.4 — clause 2E automated decisions) | live registry row `privacy_au_v2_4` effective 2026-09-26; `DISCLAIMER_VERSIONS.privacy` = v2.4-2026-09-26 |
| `0468_score_views_any_subject.sql` | **NOT applied** (26/09/2026, G33 follow-up) — additive nullable `svi_analysis_id` FK + one-subject CHECK; `score_id` NOT NULL relaxed | code (`lib/share/score-views.ts`) tolerates it missing: analysis-share views are skipped as before, score shares unchanged |
