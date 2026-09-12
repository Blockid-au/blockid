-- 0343_terms_v2_1_registry.sql (QA-3 commercial readiness audit, 2026-09-12)
-- Terms of Service v2.1: one canonical Terms at /legal/terms (the legacy
-- short-form /terms page is deleted and 301s there) and ONE refund policy,
-- clause 3A {#refunds}, replacing the three conflicting statements that
-- were live (pricing FAQ "7-day money-back, no questions asked" / legacy
-- /terms §8 cooling-off + pro-rata + unused-credit refund / v2.0 clause 3
-- "refunds only where the ACL requires"):
--   * first monthly subscription payment: 7-day money-back, no questions
--     asked, processed within 3 business days;
--   * annual plans: pro-rata refund within 14 days of the charge;
--   * one-off A$3 reports, the Startup Package and credit packs:
--     non-refundable once delivered except where the ACL requires;
--   * ACL non-excludable guarantees (clause 5) never excluded.
-- Clause 3 now states the trial length per plan as published on /pricing
-- (7 days founder/evaluator, 14 days Cohort) and that a cancellation at any
-- time before the trial ends stops the charge. Entity line, liability cap,
-- and every other clause are unchanged.
--
-- Same pattern as 0342 / 0328 / 0313 / 0080: DO NOTHING on conflict. The
-- v2.0 row (tos_au_v1) stays immutable because consent_events rows
-- reference its hash. The new (id, version) tuple is what
-- DISCLAIMER_VERSIONS.tos (web/src/lib/legal/versions.ts) now points at;
-- no re-acknowledgement trigger — step-trial records the pinned version on
-- the next trial start.
--
-- Apply by hand (self-hosted Supabase; migrations are not run on deploy):
--   docker exec -i supabase-db psql -U postgres -d postgres < this file

do $$
declare
  body text := 'Use of BlockID.au is governed by our Terms of Service v2.1 (/legal/terms), which include Australian Consumer Law non-excludable guarantees, a limitation of liability capped at the fees paid in the prior 12 months, and one refund policy (/legal/terms#refunds): a 7-day money-back guarantee on your first monthly subscription payment, no questions asked; a pro-rata refund on annual plans within 14 days of the charge; one-off A$3 reports, the Startup Package and credit packs are non-refundable once delivered except where the Australian Consumer Law requires; and in all cases your Australian Consumer Law guarantees are not excluded. Paid plans start with the free trial published on /pricing (7 days for founder and evaluator plans, 14 days for Cohort plans) and cancelling at any time before the trial ends stops the charge.';
begin
  insert into disclaimer_registry (id, version, jurisdiction, kind, effective_from, body_md, hash)
  values (
    'tos_au_v2_1',
    '2.1',
    'AU',
    'tos',
    timestamptz '2026-09-12 00:00:00+00',
    body,
    encode(digest(body, 'sha256'), 'hex')
  )
  on conflict (id) do nothing;
end $$;

notify pgrst, 'reload schema';
