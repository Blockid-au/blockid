-- 0080_disclaimer_registry_seed.sql (T-0424)
-- Seed the 6 canonical disclaimer surfaces × 2 jurisdictions (AU + GLOBAL).
-- Idempotent: inserts on id conflict only if row absent (do nothing).
--
-- Text is the machine-readable canonical version; hash is sha256(body_md)
-- so consent_events can reference a locked disclaimer_hash column.
-- Long-form MDX still lives under web/content/legal/disclaimers/ and is
-- rendered on the marketing surface; this table is the acknowledgement
-- source of truth.

do $$
declare
  rec record;
  h text;
begin
  for rec in (
    values
      ('nfa_au_v1',           '1.0', 'AU',     'not_financial_advice',
       'BlockID.au provides general information only. Nothing on this platform is personal financial product advice under s766B of the Corporations Act 2001. You should consider your own objectives, financial situation and needs before acting on any information provided. Where relevant, obtain a Product Disclosure Statement and independent professional advice.'),
      ('nfa_global_v1',       '1.0', 'GLOBAL', 'not_financial_advice',
       'BlockID provides general information only. Nothing on this platform constitutes personal financial, legal, or tax advice. Consider your own circumstances and obtain independent professional advice before acting on any information provided.'),
      ('equity_au_v1',        '1.0', 'AU',     'equity_offer_disclaimer',
       'Any equity offer facilitated through BlockID.au is subject to Corporations Act 2001 s708 exemptions (small-scale personal offer, wholesale investor, or senior manager). Offers to retail investors require a disclosure document. BlockID.au does not itself make or accept offers of securities.'),
      ('equity_global_v1',    '1.0', 'GLOBAL', 'equity_offer_disclaimer',
       'Any equity offer facilitated through BlockID may be subject to securities-law restrictions in your jurisdiction. It is your responsibility to ensure any offer or acceptance complies with local law before proceeding.'),
      ('share_issuance_au_v1','1.0', 'AU',     'share_issuance',
       'Share issuances recorded in BlockID.au are administrative records only and do not replace ASIC lodgement obligations (Form 484, s254X). You remain responsible for lodging changes to member registers within the statutory time.'),
      ('trial_au_v1',         '1.0', 'AU',     'trial',
       'Your 7-day trial converts to a paid subscription on day 8 unless cancelled. The trial requires a valid payment method on file. By starting the trial you authorise recurring charges under s31 of the ACL until you cancel via account settings.'),
      ('trial_global_v1',     '1.0', 'GLOBAL', 'trial',
       'Your 7-day trial converts to a paid subscription on day 8 unless cancelled. The trial requires a valid payment method on file. By starting the trial you authorise recurring charges until you cancel via account settings.'),
      ('tos_au_v1',           '2.0', 'AU',     'tos',
       'Use of BlockID.au is governed by our Terms of Service (v2.0), which include Australian Consumer Law non-excludable guarantees and a limitation of liability capped at the fees paid in the prior 12 months.'),
      ('privacy_au_v1',       '2.0', 'AU',     'privacy',
       'BlockID.au handles personal information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. See our Privacy Policy v2.0 for retention periods, cross-border disclosures, and how to raise a complaint with the OAIC.'),
      ('wholesale_au_v1',     '1.0', 'AU',     'wholesale_certification',
       'You warrant that you are a wholesale client under s761G(7) of the Corporations Act 2001 (net assets ≥ AU$2.5m OR gross income ≥ AU$250k in each of the last two financial years), and hold a current qualified accountant''s certificate. BlockID.au relies on this warranty for any wholesale-restricted content shown to you.')
  ) as t(id, version, jurisdiction, kind, body_md)
  loop
    h := encode(digest(rec.body_md, 'sha256'), 'hex');
    insert into disclaimer_registry (id, version, jurisdiction, kind, effective_from, body_md, hash)
    values (rec.id, rec.version, rec.jurisdiction, rec.kind, now(), rec.body_md, h)
    on conflict (id) do update
      set version       = excluded.version,
          jurisdiction  = excluded.jurisdiction,
          kind          = excluded.kind,
          body_md       = excluded.body_md,
          hash          = excluded.hash;
  end loop;
end $$;

notify pgrst, 'reload schema';
