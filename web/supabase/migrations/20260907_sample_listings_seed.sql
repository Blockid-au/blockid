-- 20260907_sample_listings_seed.sql
--
-- Seed 3 sample public listings so /listings + /reports/[ticker] have live
-- demo data for prospective customers. Currently `v_startup_listing_public`
-- is empty, so every ticker returns 404. Investors landing on the platform
-- need at least one real, browsable example.
--
-- Idempotent: ON CONFLICT DO NOTHING on both the sample app_user and the
-- three listings. Rows are visibly flagged as samples in ticker prefix
-- (SAMPLE-01/02/03) and one_liner text, so nothing masquerades as a real
-- funded company.
--
-- Additive-only. Safe to re-apply.

-- Deterministic sample-owner app_user so re-runs are stable.
insert into public.app_users (id, email, display_name)
values (
  '00000000-0000-0000-0000-0000000005a1'::uuid,
  'samples@blockid.au',
  'BlockID Sample Listings'
)
on conflict (email) do nothing;

-- Three sample listings across sectors, stages, and SVI grades.
insert into public.startup_listings (
  ticker,
  startup_id,
  name,
  sector,
  stage,
  hq_state,
  website_url,
  one_liner,
  svi_grade,
  svi_score,
  latest_raise_aud_cents,
  is_public
)
values
  (
    'SAMPLE-01',
    '00000000-0000-0000-0000-0000000005a1'::uuid,
    'Corella Health (sample)',
    'HealthTech',
    'Seed',
    'NSW',
    'https://blockid.au/listings/SAMPLE-01',
    'Sample listing — GP-first triage co-pilot cutting avoidable ED referrals in regional NSW clinics.',
    'A',
    82,
    250000000,
    true
  ),
  (
    'SAMPLE-02',
    '00000000-0000-0000-0000-0000000005a1'::uuid,
    'Reefwatch AI (sample)',
    'ClimateTech',
    'Pre-Seed',
    'QLD',
    'https://blockid.au/listings/SAMPLE-02',
    'Sample listing — reef-health computer vision for tourism operators and marine park regulators.',
    'B',
    68,
    75000000,
    true
  ),
  (
    'SAMPLE-03',
    '00000000-0000-0000-0000-0000000005a1'::uuid,
    'Ledgerpay (sample)',
    'FinTech',
    'Series A',
    'VIC',
    'https://blockid.au/listings/SAMPLE-03',
    'Sample listing — AU-first bill-split and instalments rails for SMB retail with GST-safe reconciliation.',
    'A+',
    91,
    1200000000,
    true
  )
on conflict (ticker) do nothing;
