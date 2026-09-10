-- 0310_privacy_v2_1_registry.sql (T0275, 2026-09-10)
-- Privacy Policy v2.1: one canonical policy at /legal/privacy (the second
-- notice at /privacy now 301s there); the AI provider section lists the
-- chain the platform actually runs (groq -> cerebras -> sambanova -> deepinfra
-- -> anthropic -> ollama -> openrouter, plus Google where a key is set); the
-- founder-approved data principle is added; the "never train third-party
-- models" sentence is removed (nothing is claimed about training either way).
--
-- Same pattern as 0080: DO NOTHING on conflict. The v2.0 row stays immutable
-- because consent_events rows reference its hash. The new (id, version)
-- tuple is what DISCLAIMER_VERSIONS.privacy (web/src/lib/legal/versions.ts)
-- now points at.
--
-- Apply by hand (self-hosted Supabase; migrations are not run on deploy):
--   docker exec -i supabase-db psql -U postgres -d postgres < this file

do $$
declare
  body text := 'BlockID.au handles personal information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. See our Privacy Policy v2.1 (/legal/privacy) for retention periods, the AI inference providers that may receive prompts and relevant input data under their business terms, cross-border disclosures, and how to raise a complaint with the OAIC. Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.';
begin
  insert into disclaimer_registry (id, version, jurisdiction, kind, effective_from, body_md, hash)
  values (
    'privacy_au_v2_1',
    '2.1',
    'AU',
    'privacy',
    timestamptz '2026-09-10 00:00:00+00',
    body,
    encode(digest(body, 'sha256'), 'hex')
  )
  on conflict (id) do nothing;
end $$;

notify pgrst, 'reload schema';
