-- 0328_privacy_v2_2_registry.sql (S14-A, 2026-09-11)
-- Privacy Policy v2.2: covers the Money Finder + Evaluator data introduced
-- on 2026-09-10 (migrations 0311–0327) that v2.1 predates —
--   * Money Finder intake (project_grant_profiles / funding_reports):
--     business facts used only for grant + program eligibility; founder
--     demographic flags optional, eligibility-only, withdrawable;
--   * guest A$3 purchases: email + Stripe session/payment ids, no card
--     data, tokenised report link (funding_reports.access_token);
--   * Founder Radar (funding_matches + email_drips radar_* campaigns) as the
--     `money_radar` email category with opt-out; calendar_token ICS feed;
--   * evaluator-entered startup data (evaluations / evaluation_reports /
--     evaluation_batches): indirect collection, purpose, evaluator
--     obligations, founder claim + consent_tier, founder removal route;
--   * investor_discoverable / investor_prefs: opt-in, name + firm + thesis
--     shown, email never;
--   * analysis_refreshes, dashboard_layout, refresh-funding-sources cron
--     (public pages, no personal data); retention row per new table.
-- AI provider chain (5A), the approved data principle (2A), and the entity
-- line are unchanged. Nothing is said about model training either way.
--
-- Same pattern as 0313 / 0080: DO NOTHING on conflict. The v2.0 and v2.1
-- rows stay immutable because consent_events rows reference their hashes.
-- The new (id, version) tuple is what DISCLAIMER_VERSIONS.privacy
-- (web/src/lib/legal/versions.ts) now points at; no re-acknowledgement
-- trigger — PrivacyBanner records the pinned version on next opt-in, as
-- 0313 did.
--
-- Apply by hand (self-hosted Supabase; migrations are not run on deploy):
--   docker exec -i supabase-db psql -U postgres -d postgres < this file

do $$
declare
  body text := 'BlockID.au handles personal information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. See our Privacy Policy v2.2 (/legal/privacy) for what Money Finder collects and why (eligibility matching only; demographic flags optional), guest purchases, Money Radar emails and how to opt out, startups entered by evaluators and how a founder can claim or ask for removal, investor discoverability, retention periods per data class, the AI inference providers that may receive prompts and relevant input data under their business terms, cross-border disclosures, and how to raise a complaint with the OAIC. Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.';
begin
  insert into disclaimer_registry (id, version, jurisdiction, kind, effective_from, body_md, hash)
  values (
    'privacy_au_v2_2',
    '2.2',
    'AU',
    'privacy',
    timestamptz '2026-09-11 00:00:00+00',
    body,
    encode(digest(body, 'sha256'), 'hex')
  )
  on conflict (id) do nothing;
end $$;

notify pgrst, 'reload schema';
