-- 0310_evaluator_account_types.sql
-- ---------------------------------------------------------------------------
-- T0269 (G12 sprint S1) — evaluator self-serve registration.
--
-- Why
--   `/signup?segment=evaluator` lets investors, accelerators / incubators,
--   advisors / consulting firms and service providers register with a
--   card-required 7-day Stripe trial on Scout / Firm / Program
--   (investor_angel / investor_advisor / investor_vc_small). The signup form
--   maps those four choices onto `app_users.account_type`:
--     investor · accelerator · incubator · advisor · service_provider
--   0102 already admits accelerator / incubator / advisor; `service_provider`
--   was missing, so an evaluator picking "Service provider" would fail the
--   CHECK at insert. This migration widens `app_users_account_type_check` by
--   exactly that one value. Every value 0102 listed is preserved.
--
-- Decision — `app_users.segment` CHECK is NOT widened.
--   The segment enum (0073: founder, investor_angel, investor_vc, advisor,
--   accelerator, lp, admin) is an *audience bucket* that jobs filter on
--   (`investor-weekly-digest` filters segment in (investor_angel,
--   investor_vc)); `incubator` and `service_provider` are personas, not
--   buckets, and adding them would silently drop those users out of every
--   segment-filtered digest. Registration therefore maps in code
--   (`segmentForAccountType` in web/src/lib/plans/signup-plans.ts, mirrored
--   by `Segment` in web/src/lib/segments.ts):
--     investor          -> investor_angel (investor_vc when plan = Program / VC Ent)
--     advisor           -> advisor
--     service_provider  -> advisor
--     accelerator       -> accelerator
--     incubator         -> accelerator
--     founder           -> founder
--   The segment CHECK is re-asserted below unchanged so a host that never ran
--   0073's constraint still ends up with it.
--
-- Idempotent: DROP IF EXISTS + ADD, safe to re-run. No data rewrite — all
-- existing rows already satisfy both constraints.
-- ---------------------------------------------------------------------------

-- 1. account_type: add service_provider (T0269 evaluator persona).
ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_account_type_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_account_type_check CHECK (
    account_type IN (
      'founder',
      'investor',
      'journalist',
      'investor_angel',
      'investor_vc',
      'advisor',
      'accelerator',
      'incubator',
      'reseller',
      'affiliate',
      'service_provider'
    )
  );

-- 2. segment: unchanged shape (see header) — re-asserted for hosts that
--    never received 0073's DO-block constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_users_segment_check'
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT app_users_segment_check
      CHECK (segment IN ('founder','investor_angel','investor_vc','advisor','accelerator','lp','admin'));
  END IF;
END $$;

-- 3. Backfill: self-serve evaluators registered before this migration were
--    inserted with the 0073 default segment 'founder' (register-with-card
--    never wrote segment). Re-derive it from account_type for rows that are
--    still on the default and hold an evaluator plan, so the weekly investor
--    digest picks them up. Founder-plan rows are untouched.
UPDATE public.app_users
   SET segment = CASE
         WHEN account_type = 'investor' AND plan IN ('investor_vc_small','investor_vc_ent') THEN 'investor_vc'
         WHEN account_type IN ('investor','investor_angel')   THEN 'investor_angel'
         WHEN account_type = 'investor_vc'                     THEN 'investor_vc'
         WHEN account_type IN ('advisor','service_provider')   THEN 'advisor'
         WHEN account_type IN ('accelerator','incubator')      THEN 'accelerator'
         ELSE segment
       END
 WHERE (segment IS NULL OR segment = 'founder')
   AND account_type IN ('investor','investor_angel','investor_vc','advisor','service_provider','accelerator','incubator')
   AND plan IN ('investor_angel','investor_advisor','investor_vc_small','investor_vc_ent',
                'accelerator_starter','accelerator_growth','accelerator_enterprise');

NOTIFY pgrst, 'reload schema';
