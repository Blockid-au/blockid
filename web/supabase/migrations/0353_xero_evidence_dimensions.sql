-- 0353 — Xero evidence rows onto real SVI dimensions (S25-review-2 P3).
--
-- The Xero OAuth callback (since T0016) and the S25-A weekly resync wrote
-- `svi_evidence` rows with dimension = 'financial_health' (xero_pl) and
-- 'traction' (xero_revenue). Neither is one of the 8 SVI keys
-- (ftv, mpc, ptd, tre, cgh, iri, lco, svm), so `rescoreAccountFromEvidence`
-- skipped them. Code now writes xero_pl → 'iri' and xero_revenue → 'tre'
-- (XERO_PL_EVIDENCE_DIMENSION / XERO_REVENUE_EVIDENCE_DIMENSION in
-- web/src/lib/connectors/xero-metrics.ts). Because the upsert matches on
-- (account_id, evidence_type, dimension), the old-key rows would otherwise be
-- left behind forever (and a second row per key would break the
-- `.maybeSingle()` lookup), so this moves them.
--
-- Idempotent: re-running finds no old-key rows and changes nothing. No
-- BEGIN/COMMIT here — scripts/db/apply-migration.sh runs the file in one
-- transaction already.

-- 1. Move rows whose account has no row on the new key yet.
update public.svi_evidence e
   set dimension = 'iri'
 where e.evidence_type = 'xero_pl'
   and e.dimension = 'financial_health'
   and not exists (
     select 1 from public.svi_evidence n
      where n.account_id = e.account_id
        and n.evidence_type = 'xero_pl'
        and n.dimension = 'iri');

update public.svi_evidence e
   set dimension = 'tre'
 where e.evidence_type = 'xero_revenue'
   and e.dimension = 'traction'
   and not exists (
     select 1 from public.svi_evidence n
      where n.account_id = e.account_id
        and n.evidence_type = 'xero_revenue'
        and n.dimension = 'tre');

-- 2. Any old-key row still left has a newer row on the new key for the same
--    account (the new code ran before this migration was applied). The
--    connector rewrites the new-key row on every sync, so the stale old-key
--    duplicate carries nothing the new row does not — drop it so the
--    per-(account, type, dimension) lookup stays single-row.
delete from public.svi_evidence
 where evidence_type = 'xero_pl' and dimension = 'financial_health';

delete from public.svi_evidence
 where evidence_type = 'xero_revenue' and dimension = 'traction';
