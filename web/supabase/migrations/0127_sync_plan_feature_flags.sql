-- 0127_sync_plan_feature_flags.sql
-- ---------------------------------------------------------------------------
-- Resync plans.feature_flags to plans.csv, the source of truth.
--
-- Why
--   The DB had drifted from the CSV, and `getEntitlements()` reads the DB at
--   runtime. Live state before this migration:
--
--     founder_free        share_management: no   data_room.access: no
--     founder_starter     share_management: no   data_room.access: no
--     founder_growth      share_management: NO   data_room.access: yes   <-- drift
--     founder_scale       share_management: NO   data_room.access: NO    <-- drift
--     founder_enterprise  share_management: no   data_room.access: NO    <-- drift
--
--   `share_management` gates POST /api/data-room/generate, so **every founder
--   tier returned 402 feature_locked** — the data room shipped today was
--   unreachable for every paying customer, including the one live Enterprise
--   account. This is drift, not a deliberate gate: plans.csv has granted
--   share_management to Growth and Pro all along.
--
--   Also fixes a genuine error in the CSV itself: founder_enterprise was
--   missing share_management, investor_pack and per_investor_share_links,
--   which Growth (a cheaper tier) has. A top tier holding fewer features than
--   the one below it is never intentional. Enterprise is now a superset.
--
--   founder_scale is retired (active=false) but keeps its flags so a
--   grandfathered Pro subscriber is not silently downgraded.
--
--   Second instance of the same class, caught by the superset test added
--   alongside this migration: founder_growth was missing `svi.premium`, which
--   founder_starter (half the price) had. Upgrading from Starter to Growth
--   therefore took a flag away. `svi.premium` currently gates nothing (zero
--   call sites), so it was added upward rather than removed from Starter —
--   adding can never take a feature from an existing subscriber, removing can.
--
-- Generated from web/src/config/pricing/plans.csv — regenerate
-- plans.generated.ts with `npx tsx scripts/build-plans.ts` when changing either.
--
-- Idempotent: plain UPDATEs keyed on id, safe to re-run.
-- ---------------------------------------------------------------------------

update plans
   set feature_flags = '["svi.public"]'::jsonb,
       updated_at    = now()
 where id = 'founder_free';

update plans
   set feature_flags = '["profile.multi", "svi.premium"]'::jsonb,
       updated_at    = now()
 where id = 'founder_starter';

update plans
   set feature_flags = '["profile.multi", "svi.premium", "cap_table.write", "data_room.access", "investor_links.premium", "term_sheet_ai", "share_management", "investor_pack", "per_investor_share_links"]'::jsonb,
       updated_at    = now()
 where id = 'founder_growth';

update plans
   set feature_flags = '["profile.multi", "svi.premium", "cap_table.write", "data_room.access", "investor_links.premium", "term_sheet_ai", "share_management", "investor_pack", "per_investor_share_links", "esop.manage", "blockchain.sync", "advisor_portal", "white_label", "c_level_agents", "dcf_sensitivity", "dividend_engine", "white_label_pdf"]'::jsonb,
       updated_at    = now()
 where id = 'founder_scale';

update plans
   set feature_flags = '["profile.multi", "svi.premium", "cap_table.write", "data_room.access", "investor_links.premium", "term_sheet_ai", "share_management", "investor_pack", "per_investor_share_links", "esop.manage", "blockchain.sync", "advisor_portal", "white_label", "api.access", "sso"]'::jsonb,
       updated_at    = now()
 where id = 'founder_enterprise';

notify pgrst, 'reload schema';
