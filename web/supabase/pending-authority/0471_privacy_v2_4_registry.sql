-- 0471_privacy_v2_4_registry.sql (2026-09-26, APP 1.7)
-- Privacy Policy v2.4 adds clause 2E "Automated decisions and AI analysis"
-- (EN + VI): which decisions BlockID's programs make (SVI index, Investor
-- Score, evidence confidence, meeting labels, valuation ranges when evidence
-- allows), the personal information they may use, decisions others make with
-- their help, and how to ask a person to review or correct a result. Required
-- by the Privacy Act amendment in force from 10 December 2026.
-- Same pattern as 0342 / 0328 / 0313: DO NOTHING on conflict; older rows stay
-- immutable because consent_events reference their hashes. The new row is
-- what DISCLAIMER_VERSIONS.privacy (web/src/lib/legal/versions.ts) points at.
-- Kept in pending-authority/ (schemaDigest rule); apply by hand:
--   docker exec -i supabase-db psql -U postgres -d postgres < this file

do $$
declare
  body text := 'BlockID.au handles personal information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. See our Privacy Policy v2.4 (/legal/privacy) for what Money Finder collects and why (eligibility matching only; demographic flags optional), guest purchases, Money Radar emails and how to opt out, startups entered by evaluators and how a founder can claim or ask for removal, investor discoverability, the investor data-room confidentiality acceptance record and engagement telemetry a founder sees, automated decisions and AI analysis (what our programs score, the information they may use, and how to ask a person to review or correct a result), retention periods per data class, the AI inference providers that may receive prompts and relevant input data under their business terms, cross-border disclosures, and how to raise a complaint with the OAIC. Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.';
begin
  insert into disclaimer_registry (id, version, jurisdiction, kind, effective_from, body_md, hash)
  values (
    'privacy_au_v2_4',
    '2.4',
    'AU',
    'privacy',
    timestamptz '2026-09-26 00:00:00+00',
    body,
    encode(digest(body, 'sha256'), 'hex')
  )
  on conflict (id) do nothing;
end $$;

notify pgrst, 'reload schema';
