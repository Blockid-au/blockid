-- 0342_privacy_v2_3_registry.sql (S21-A review follow-up, 2026-09-12)
-- Privacy Policy v2.3: covers the investor data-room records S21-A
-- (migration 0339) introduced that v2.2 predates —
--   * data_room_nda_acceptances: the confidentiality (NDA) acceptance an
--     investor gives on a share link — version, sha256 of the clause shown,
--     the email the investor chooses to give, a salted hash of the network
--     address, browser family. A consent record: kept for the life of the
--     data room + 7 years, never swept while the room exists (clause 4);
--   * data_room_engagement: engagement telemetry the founder sees —
--     section, dwell, document opens / downloads, salted ip-hash prefix,
--     truncated UA. Deleted 12 months after the event by the weekly
--     retention sweep (lib/privacy/retention.ts rule `data_room_engagement`).
-- Clause 1 lists both as "Investor data-room records". AI provider chain
-- (5A), the approved data principle (2A), and the entity line are
-- unchanged. Nothing is said about model training either way.
--
-- Same pattern as 0328 / 0313 / 0080: DO NOTHING on conflict. The v2.0,
-- v2.1 and v2.2 rows stay immutable because consent_events rows reference
-- their hashes. The new (id, version) tuple is what
-- DISCLAIMER_VERSIONS.privacy (web/src/lib/legal/versions.ts) now points
-- at; no re-acknowledgement trigger — PrivacyBanner records the pinned
-- version on next opt-in, as 0328 did.
--
-- Apply by hand (self-hosted Supabase; migrations are not run on deploy):
--   docker exec -i supabase-db psql -U postgres -d postgres < this file

do $$
declare
  body text := 'BlockID.au handles personal information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. See our Privacy Policy v2.3 (/legal/privacy) for what Money Finder collects and why (eligibility matching only; demographic flags optional), guest purchases, Money Radar emails and how to opt out, startups entered by evaluators and how a founder can claim or ask for removal, investor discoverability, the investor data-room confidentiality acceptance record and engagement telemetry a founder sees, retention periods per data class, the AI inference providers that may receive prompts and relevant input data under their business terms, cross-border disclosures, and how to raise a complaint with the OAIC. Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.';
begin
  insert into disclaimer_registry (id, version, jurisdiction, kind, effective_from, body_md, hash)
  values (
    'privacy_au_v2_3',
    '2.3',
    'AU',
    'privacy',
    timestamptz '2026-09-12 00:00:00+00',
    body,
    encode(digest(body, 'sha256'), 'hex')
  )
  on conflict (id) do nothing;
end $$;

notify pgrst, 'reload schema';
