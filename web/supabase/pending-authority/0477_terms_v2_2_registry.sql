-- 0477_terms_v2_2_registry.sql (G35 Pricing v5 wave P5, 2026-10-20)
-- Terms of Service v2.2 — clause 3A only (docs/pricing-v5-plan.md §6.7):
--   * one-off reports are described by "the price shown on the review step
--     before you pay" instead of a fixed A$ amount, so the clause is true
--     with platform_config.payg_enabled off (legacy single report / Money
--     Finder) and on (Snapshot / Full / Verified, Money Finder at the
--     Snapshot price point) — ONE current version, independent of the flag;
--   * they remain non-refundable once delivered except where the Australian
--     Consumer Law requires a refund;
--   * NEW right: a report that includes a review by the BlockID team (for
--     example a Verified report) is refunded in full on request while it is
--     still in review (worded "where we offer", so it never describes a
--     product that cannot be bought while the flag is off);
--   * ACL non-excludable guarantees (clause 5) are never excluded.
-- Every other clause, the entity line and the liability cap are unchanged.
-- v2.2 only adds rights, so (like v2.1) it takes effect immediately.
--
-- Same pattern as 0346 / 0471: DO NOTHING on conflict. Older rows
-- (tos_au_v1, tos_au_v2_1) stay immutable because consent_events rows
-- reference their hashes. DISCLAIMER_VERSIONS.tos (web/src/lib/legal/
-- versions.ts) points at this (id, version) tuple.
--
-- NOT APPLIED. Kept in pending-authority/ (schemaDigest rule); the founder
-- applies it with the P5 cut-over:
--   bash scripts/db/apply-migration.sh web/supabase/pending-authority/0477_terms_v2_2_registry.sql
-- (or: docker exec -i supabase-db psql -U postgres -d postgres < this file)

do $$
declare
  body text := 'Use of BlockID.au is governed by our Terms of Service v2.2 (/legal/terms), which include Australian Consumer Law non-excludable guarantees, a limitation of liability capped at the fees paid in the prior 12 months, and one refund policy (/legal/terms#refunds): a 7-day money-back guarantee on your first monthly subscription payment, no questions asked; a pro-rata refund on annual plans within 14 days of the charge; one-off reports (at the price shown on the review step before you pay), the Startup Package and credit packs are non-refundable once delivered except where the Australian Consumer Law requires; a report that includes a review by the BlockID team, where we offer one, is refunded in full on request while it is still in review; and in all cases your Australian Consumer Law guarantees are not excluded. Paid plans start with the free trial published on /pricing (7 days for founder and evaluator plans, 14 days for Cohort plans) and cancelling at any time before the trial ends stops the charge.';
begin
  insert into disclaimer_registry (id, version, jurisdiction, kind, effective_from, body_md, hash)
  values (
    'tos_au_v2_2',
    '2.2',
    'AU',
    'tos',
    timestamptz '2026-10-20 00:00:00+00',
    body,
    encode(digest(body, 'sha256'), 'hex')
  )
  on conflict (id) do nothing;
end $$;

notify pgrst, 'reload schema';
