-- 0122_scores_investor_consent.sql
-- ---------------------------------------------------------------------------
-- Require explicit consent before a founder's score appears in investor deal flow.
--
-- Why
--   `getInvestorDealflow` (web/src/lib/investor-portal.ts) selected every row
--   from `scores` above a score threshold, with no opt-in filter of any kind —
--   because no such column existed. Any founder who ran the free score on
--   /score had their company name and SVI score surfaced to every investor and
--   accelerator account, without ever being asked. 41 score rows across 18
--   distinct emails were exposed this way to 5 investor/accelerator accounts.
--
--   The site publicly claims Australian Privacy Act APP 1-13 compliance, and
--   APP 6 governs use and disclosure for a secondary purpose. A founder scoring
--   their own company has not consented to being listed as deal flow.
--
--   (The email column was only ever used server-side to join snapshots and did
--   not reach the investor UI — the disclosure was company name + score.)
--
-- What
--   Adds `investor_visible`, defaulting to FALSE. Existing rows therefore
--   become invisible immediately, which is the correct default: consent cannot
--   be assumed retroactively. Deal flow will legitimately read empty until
--   founders opt in through a publish control.
--
-- Idempotent: `add column if not exists`, safe to re-run.
-- ---------------------------------------------------------------------------

alter table scores
  add column if not exists investor_visible boolean not null default false;

comment on column scores.investor_visible is
  'Founder opt-in. When false the row must never appear in investor deal flow, the public index, or any investor-facing surface. Default false — consent is never assumed.';

create index if not exists scores_investor_visible_idx
  on scores (investor_visible, total_score desc)
  where investor_visible;

notify pgrst, 'reload schema';
