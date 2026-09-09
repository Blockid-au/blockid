-- 0131_starter_data_room_investor_links.sql
-- ---------------------------------------------------------------------------
-- Give founder_starter (A$29) the two flags the homepage already sells it.
--
-- Why
--   web/src/components/marketing/homepage/tiers.ts sells the A$29 "Workspace"
--   rung a data room and a live investor link. The plan granted neither:
--
--     founder_starter  ["profile.multi", "svi.premium"]
--
--   and `svi.premium` gates nothing anywhere in application code, so the only
--   enforced thing a A$29 subscriber bought was `profile.multi`. Four of the
--   five bullets on the card redirected them to /pricing.
--
--   This migration is the DB half of the change to plans.csv. `getEntitlements()`
--   reads `plans.feature_flags` from this table at runtime — the CSV is only a
--   fallback for a DB miss — so a CSV-only change would have shipped nothing.
--   Migration 0127 exists because exactly that drift happened before.
--
-- What moves
--   founder_starter  + data_room.access
--                    + investor_links.premium
--
-- What deliberately does NOT move
--   cap_table.write, term_sheet_ai and share_management stay at founder_growth
--   (A$69). A$29 is "your score over time, a data room, a live investor link";
--   A$69 is "your equity". Granting all five would have made the retired
--   A$299 tier's headline free.
--
-- No other plan row changes, so no existing subscriber can lose a flag: this
-- is a pure addition to one plan.
--
-- Generated from web/src/config/pricing/plans.csv — regenerate
-- plans.generated.ts with `npx tsx scripts/build-plans.ts` when changing either.
--
-- Idempotent: a plain UPDATE keyed on id, safe to re-run.
-- ---------------------------------------------------------------------------

update plans
   set feature_flags = '["profile.multi", "svi.premium", "data_room.access", "investor_links.premium"]'::jsonb,
       updated_at    = now()
 where id = 'founder_starter';

notify pgrst, 'reload schema';
