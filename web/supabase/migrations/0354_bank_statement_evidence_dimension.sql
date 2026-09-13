-- 0354 — bank_statement evidence rows onto an SVI dimension (same bug class as
-- 0353: /api/evidence/bank-statement wrote dimension = 'financial_health',
-- which is not one of the 8 SVI keys, so the rescore ignored the upload).
-- Code now writes 'iri' (like xero_pl). Idempotent; no BEGIN/COMMIT — the
-- apply script wraps the file in one transaction.
update public.svi_evidence
   set dimension = 'iri'
 where evidence_type = 'bank_statement'
   and dimension = 'financial_health';
