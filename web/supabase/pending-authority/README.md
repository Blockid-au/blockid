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
