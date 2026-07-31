-- 0300_seed_sprocketbay_journey.sql
-- Seeds the DATA behind the Sprocketbay process walkthrough
-- (/showcase/sprocketbay) against the demo profile migration 0299
-- published at /id/sprocketbay-demo.
--
-- WHY THIS EXISTS
-- ---------------
-- 0299 seeded the *outcome*: a published profile at Level 4 with 12
-- capability scores and four sample attesters. It said nothing about how
-- the company got there. A founder reading the marketing copy still had
-- to take on faith that "upload evidence → get scored → unlock an
-- artefact" is a real pipeline rather than a diagram.
--
-- This migration seeds the working: 34 evidence rows across the six
-- unicorn stages, the matching data-room documents, the 13 completed
-- SVI criterion assessments, and the six stage-progress rows with the
-- engine verdict recorded on each. With these present the walkthrough is
-- backed by the same tables a real customer's workspace reads from, not
-- by a static page.
--
-- SOURCE OF TRUTH IS THE TYPED FIXTURE
-- ------------------------------------
-- Every value below is emitted from
-- `web/src/lib/showcase/sprocketbay/journey.ts`, whose colocated test
-- (73 cases across journey/disclosure/page) recomputes each score
-- through the production engines — computeQuality(), the CRITERIA
-- weights, computeVerificationLevel(), computeStageProgress() and
-- nextEvidenceState() — and asserts them against the framework
-- catalogues and against what 0299 stored. Nothing here was typed by
-- hand; if the fixture and this file ever disagree, the fixture is
-- right and this file must be regenerated.
--
-- SAMPLE DATA — NOT A REAL BUSINESS
-- ---------------------------------
--   * Sprocketbay Demo Co is fictional (see 0299's header). No ABN is
--     recorded anywhere, and Auschain PTY LTD's real ABN must never be
--     attached to a demo row.
--   * Every evidence row carries `metadata->>'sample_data' = true` and a
--     `demo_artefact_id`. The `storage_path` values point at
--     `demo/sprocketbay/*.placeholder` — THERE ARE NO BINARIES. The
--     `sha256` values are deterministic digests of the artefact id, not
--     of any file, so nothing here can be mistaken for a real
--     tamper-evidence record.
--   * Every data-room note and criterion summary is prefixed
--     "SAMPLE DATA".
--   * Issuer names reuse only the invented "(sample)"-suffixed firms
--     already introduced by 0299.
--
-- ONE CORRECTION TO 0299
-- ----------------------
-- 0299 set `projects.growth_phase_current = 'scale'`. That is not a
-- member of the 12-phase taxonomy (`GROWTH_PHASE_IDS` in
-- web/src/lib/journey-map.ts is vision…funding — there is no 'scale'),
-- so any consumer doing a label lookup on it gets nothing. The demo
-- company sits in S5 / the `funding` phase, which is what this migration
-- writes. `growth_completion_pct` is left at 78: it measures phase-step
-- completion, not the trust composite, so it is not the same 81.3 the
-- profile publishes and should not be conformed to it.
--
-- IDEMPOTENCY
-- -----------
--   * `svi_accounts`, `data_rooms` — looked up first, inserted only when
--     absent, otherwise refreshed in place.
--   * `evaluation_criteria` — ON CONFLICT on the
--     (account_id, criterion_key) unique constraint.
--   * `evidence`, `data_room_documents`, `business_stage_progress` — no
--     natural key covers them (evidence's only unique index is partial
--     and excludes archived rows, of which this seed has 9), so each is
--     cleared for THIS demo project only and re-inserted. The evidence
--     delete is further narrowed to rows carrying `demo_artefact_id`, so
--     it can never touch a real customer's uploads even if the project
--     id were ever reused.
--
-- Every FK is resolved by lookup — no hard-coded UUIDs.
--
-- Applied via:
--   docker cp 0300_seed_sprocketbay_journey.sql supabase-db:/tmp/x.sql
--   docker exec supabase-db psql -U postgres -d postgres -f /tmp/x.sql
--
-- Depends on: 0044 (evaluation_criteria), 0062 (data room), 0210
-- (evidence), 0280 (unicorn_stages + business_stage_progress), 0298
-- (profile_kind), 0299 (the profile itself).

BEGIN;

DO $$
DECLARE
  owner_id uuid;
  proj_id  uuid;
  acct_id  uuid;
  room_id  uuid;
BEGIN
  -- ── Resolve the demo account + profile seeded by 0299 ────────────
  SELECT id INTO owner_id
    FROM public.app_users
   WHERE lower(email) = 'demo@blockid.au'
   LIMIT 1;

  IF owner_id IS NULL THEN
    RAISE EXCEPTION
      'app_users row for demo@blockid.au is missing — apply 0299_seed_sprocketbay_demo_profile.sql first.';
  END IF;

  SELECT id INTO proj_id
    FROM public.projects
   WHERE public_slug = 'sprocketbay-demo'
   LIMIT 1;

  IF proj_id IS NULL THEN
    RAISE EXCEPTION
      'projects row for public_slug=sprocketbay-demo is missing — apply 0299_seed_sprocketbay_demo_profile.sql first.';
  END IF;

  -- ── Correct the invalid growth phase 0299 wrote ──────────────────
  UPDATE public.projects
     SET growth_phase_current = 'funding',
         updated_at           = now()
   WHERE id = proj_id
     AND growth_phase_current IS DISTINCT FROM 'funding';

  -- ── SVI account (evaluation_criteria.account_id FK target) ───────
  SELECT id INTO acct_id
    FROM public.svi_accounts
   WHERE lower(email) = 'demo@blockid.au'
   LIMIT 1;

  IF acct_id IS NULL THEN
    INSERT INTO public.svi_accounts (
      email, name, startup_name, current_stage, current_svi, plan,
      project_id, growth_phase_current, growth_completion_pct
    ) VALUES (
      'demo@blockid.au',
      'BlockID Demo (Sample Account)',
      'Sprocketbay Demo Co (Sample Profile)',
      6, 100, 'free', proj_id, 'funding', 78
    )
    RETURNING id INTO acct_id;
  ELSE
    UPDATE public.svi_accounts
       SET name                  = 'BlockID Demo (Sample Account)',
           startup_name          = 'Sprocketbay Demo Co (Sample Profile)',
           current_stage         = 6,
           project_id            = proj_id,
           growth_phase_current  = 'funding',
           growth_completion_pct = 78
     WHERE id = acct_id;
  END IF;

  -- ── Data room shell ──────────────────────────────────────────────
  SELECT id INTO room_id
    FROM public.data_rooms
   WHERE project_id = proj_id
     AND name = 'Sprocketbay Demo Data Room (Sample Data)'
   LIMIT 1;

  IF room_id IS NULL THEN
    INSERT INTO public.data_rooms (
      user_id, project_id, name, description, template, is_public
    ) VALUES (
      owner_id, proj_id,
      'Sprocketbay Demo Data Room (Sample Data)',
      'SAMPLE DATA — the investor data room a fictional company assembled while walking the BlockID process. Every document below is illustrative; no files exist behind these rows.',
      'blockid-10-section', false
    )
    RETURNING id INTO room_id;
  ELSE
    UPDATE public.data_rooms
       SET user_id    = owner_id,
           updated_at = now()
     WHERE id = room_id;
  END IF;

  DELETE FROM public.evidence
   WHERE business_id = proj_id
     AND metadata ? 'demo_artefact_id';

  INSERT INTO public.evidence (
    business_id, owner_user_id, category, content_type, size_bytes,
    sha256, storage_path, sensitivity, issuer, issued_at, expires_at,
    verification_state, scan_verdict, scan_scanned_at, metadata
  ) VALUES
    (proj_id, owner_id, 'identity', 'application/pdf', 412308,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a01-founder-id')::bytea), 'hex'),
     'demo/sprocketbay/sb-a01-founder-id.placeholder', 'highly_sensitive',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-02-06', date '2029-02-06',
     'verified', 'clean', timestamptz '2024-02-06 00:00:00+00',
     '{"demo_artefact_id":"sb-a01-founder-id","sample_data":true,"title":"Founder identity check — lead founder (sample)","stage":"S0","analysis_area":"founder_leadership","svi_criterion":"founder_profile","stage_coverage":["identity"],"produced_by":"Completed the identity step in onboarding: government-ID capture plus a liveness check, then confirmed the account email.","data_room_folder":"6. Team & Advisors","data_room_document":"Founder Profiles"}'::jsonb),
    (proj_id, owner_id, 'governance', 'application/pdf', 188442,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a02-cert-registration')::bytea), 'hex'),
     'demo/sprocketbay/sb-a02-cert-registration.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-02-07', NULL,
     'verified', 'clean', timestamptz '2024-02-07 00:00:00+00',
     '{"demo_artefact_id":"sb-a02-cert-registration","sample_data":true,"title":"Certificate of Registration (sample)","stage":"S0","analysis_area":"governance_risk_compliance","svi_criterion":"documents","stage_coverage":["identity","ownership"],"produced_by":"Uploaded the incorporation certificate issued when the Pty Ltd was registered.","data_room_folder":"1. Corporate & Legal","data_room_document":"Certificate of Registration"}'::jsonb),
    (proj_id, owner_id, 'governance', 'application/pdf', 640115,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a03-founder-vesting')::bytea), 'hex'),
     'demo/sprocketbay/sb-a03-founder-vesting.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-02-09', NULL,
     'verified', 'clean', timestamptz '2024-02-09 00:00:00+00',
     '{"demo_artefact_id":"sb-a03-founder-vesting","sample_data":true,"title":"Founder agreements & vesting schedules (sample)","stage":"S0","analysis_area":"founder_leadership","svi_criterion":"founder_profile","stage_coverage":["ownership"],"produced_by":"Signed founder agreements with a 4-year vest and a 12-month cliff before any code was written.","data_room_folder":"2. Cap Table & Equity","data_room_document":"Founder Agreements & Vesting Schedules"}'::jsonb),
    (proj_id, owner_id, 'traction', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 96770,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a04-discovery-log')::bytea), 'hex'),
     'demo/sprocketbay/sb-a04-discovery-log.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-02-16', NULL,
     'verified', 'clean', timestamptz '2024-02-16 00:00:00+00',
     '{"demo_artefact_id":"sb-a04-discovery-log","sample_data":true,"title":"Customer discovery interview log — 14 interviews (sample)","stage":"S0","analysis_area":"competitive_positioning","svi_criterion":"market","stage_coverage":[],"produced_by":"Ran 14 recorded discovery calls with platform engineers and wrote up the pain points that repeated in more than half of them.","data_room_folder":"5. Market & Traction","data_room_document":"Customer Discovery Interview Log"}'::jsonb),
    (proj_id, owner_id, 'governance', 'application/pdf', 1204882,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a05-constitution')::bytea), 'hex'),
     'demo/sprocketbay/sb-a05-constitution.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-02-22', NULL,
     'verified', 'clean', timestamptz '2024-02-22 00:00:00+00',
     '{"demo_artefact_id":"sb-a05-constitution","sample_data":true,"title":"Constitution / replaceable rules adoption (sample)","stage":"S1","analysis_area":"governance_risk_compliance","svi_criterion":"documents","stage_coverage":["governance"],"produced_by":"Adopted a constitution instead of the replaceable rules so the share classes and pre-emption terms were settled before the first hire.","data_room_folder":"1. Corporate & Legal","data_room_document":"Constitution or Replaceable Rules"}'::jsonb),
    (proj_id, owner_id, 'governance', 'application/pdf', 74930,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a06-directors-register')::bytea), 'hex'),
     'demo/sprocketbay/sb-a06-directors-register.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-02-23', date '2027-02-23',
     'verified', 'clean', timestamptz '2024-02-23 00:00:00+00',
     '{"demo_artefact_id":"sb-a06-directors-register","sample_data":true,"title":"Register of directors & secretaries (sample)","stage":"S1","analysis_area":"governance_risk_compliance","svi_criterion":"documents","stage_coverage":["governance"],"produced_by":"Recorded both directors and the company secretary, with consents to act attached.","data_room_folder":"1. Corporate & Legal","data_room_document":"Register of Directors & Secretaries"}'::jsonb),
    (proj_id, owner_id, 'financial', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 2338104,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a07-financial-model')::bytea), 'hex'),
     'demo/sprocketbay/sb-a07-financial-model.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-03-05', date '2025-03-05',
     'archived', 'clean', timestamptz '2024-03-05 00:00:00+00',
     '{"demo_artefact_id":"sb-a07-financial-model","sample_data":true,"title":"Financial model — 3-year projection v1 (sample)","stage":"S1","analysis_area":"financial_health","svi_criterion":null,"stage_coverage":["finance_baseline"],"produced_by":"Built the first bottom-up model: seats × price × conversion, with the cost base driven off headcount rather than a growth percentage.","data_room_folder":"3. Financial Projections","data_room_document":"Financial Model (3-Year Projection)"}'::jsonb),
    (proj_id, owner_id, 'identity', 'application/json', 4512,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a08-domain-control')::bytea), 'hex'),
     'demo/sprocketbay/sb-a08-domain-control.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-03-09', date '2027-03-09',
     'verified', 'clean', timestamptz '2024-03-09 00:00:00+00',
     '{"demo_artefact_id":"sb-a08-domain-control","sample_data":true,"title":"Domain control verification record (sample)","stage":"S1","analysis_area":"website_digital_presence","svi_criterion":"website","stage_coverage":["identity"],"produced_by":"Proved control of the primary domain with a DNS TXT record, which is what moves the ladder past self-declared.","data_room_folder":"7. IP & Compliance","data_room_document":"Domain Name Register"}'::jsonb),
    (proj_id, owner_id, 'product', 'application/pdf', 883401,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a09-tech-architecture')::bytea), 'hex'),
     'demo/sprocketbay/sb-a09-tech-architecture.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-03-20', NULL,
     'verified', 'clean', timestamptz '2024-03-20 00:00:00+00',
     '{"demo_artefact_id":"sb-a09-tech-architecture","sample_data":true,"title":"Technical architecture note — MVP (sample)","stage":"S1","analysis_area":"technology_architecture","svi_criterion":"code_git","stage_coverage":["product"],"produced_by":"Wrote down the MVP architecture, the data model and the two decisions that would be expensive to reverse later.","data_room_folder":"4. Product & Technology","data_room_document":"Technical Architecture"}'::jsonb),
    (proj_id, owner_id, 'other', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 14882003,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a10-pitch-deck-v1')::bytea), 'hex'),
     'demo/sprocketbay/sb-a10-pitch-deck-v1.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-04-02', NULL,
     'archived', 'clean', timestamptz '2024-04-02 00:00:00+00',
     '{"demo_artefact_id":"sb-a10-pitch-deck-v1","sample_data":true,"title":"Pitch deck v1 (sample)","stage":"S1","analysis_area":"governance_risk_compliance","svi_criterion":"documents","stage_coverage":[],"produced_by":"Assembled the first deck — problem, wedge, the 14 interviews, and an explicit note that there was no revenue yet.","data_room_folder":"1. Corporate & Legal","data_room_document":"Pitch Deck"}'::jsonb),
    (proj_id, owner_id, 'financial', 'text/csv', 331776,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a11-revenue-proof')::bytea), 'hex'),
     'demo/sprocketbay/sb-a11-revenue-proof.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-05-08', date '2025-05-08',
     'archived', 'clean', timestamptz '2024-05-08 00:00:00+00',
     '{"demo_artefact_id":"sb-a11-revenue-proof","sample_data":true,"title":"Revenue proof — payment processor export (sample)","stage":"S2","analysis_area":"revenue_model_sales","svi_criterion":"revenue","stage_coverage":["revenue"],"produced_by":"Connected the payment processor and exported the first two quarters of settled invoices rather than typing MRR into a slide.","data_room_folder":"3. Financial Projections","data_room_document":"Revenue Proof (Stripe / Bank)"}'::jsonb),
    (proj_id, owner_id, 'other', 'application/pdf', 1776210,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a12-gtm-strategy')::bytea), 'hex'),
     'demo/sprocketbay/sb-a12-gtm-strategy.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-05-22', NULL,
     'verified', 'clean', timestamptz '2024-05-22 00:00:00+00',
     '{"demo_artefact_id":"sb-a12-gtm-strategy","sample_data":true,"title":"Go-to-market strategy — self-serve motion (sample)","stage":"S2","analysis_area":"gtm_strategy","svi_criterion":"gtm_strategy","stage_coverage":["gtm"],"produced_by":"Documented the low-touch motion: docs-led acquisition, no outbound team, and the two channels that were allowed to consume budget.","data_room_folder":"9. Strategy & Roadmap","data_room_document":"Go-to-Market Strategy"}'::jsonb),
    (proj_id, owner_id, 'traction', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 148992,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a13-customer-concentration')::bytea), 'hex'),
     'demo/sprocketbay/sb-a13-customer-concentration.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-06-14', date '2025-06-14',
     'archived', 'clean', timestamptz '2024-06-14 00:00:00+00',
     '{"demo_artefact_id":"sb-a13-customer-concentration","sample_data":true,"title":"Top-20 customer revenue concentration (sample)","stage":"S2","analysis_area":"business_performance_kpis","svi_criterion":null,"stage_coverage":["customers"],"produced_by":"Pulled revenue by account to check whether the self-serve motion had quietly become dependent on a handful of logos.","data_room_folder":"5. Market & Traction","data_room_document":"Top-20 Customer Revenue Concentration"}'::jsonb),
    (proj_id, owner_id, 'contract', 'application/pdf', 2105664,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a14-shareholders-agreement')::bytea), 'hex'),
     'demo/sprocketbay/sb-a14-shareholders-agreement.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-06-27', NULL,
     'verified', 'clean', timestamptz '2024-06-27 00:00:00+00',
     '{"demo_artefact_id":"sb-a14-shareholders-agreement","sample_data":true,"title":"Shareholders agreement (sample)","stage":"S2","analysis_area":"governance_risk_compliance","svi_criterion":"documents","stage_coverage":["ownership","governance"],"produced_by":"Executed a shareholders agreement covering drag/tag, reserved matters and what happens if a founder leaves.","data_room_folder":"2. Cap Table & Equity","data_room_document":"Shareholders Agreement"}'::jsonb),
    (proj_id, owner_id, 'people', 'application/pdf', 1442300,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a15-esop-rules')::bytea), 'hex'),
     'demo/sprocketbay/sb-a15-esop-rules.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-07-30', NULL,
     'verified', 'clean', timestamptz '2024-07-30 00:00:00+00',
     '{"demo_artefact_id":"sb-a15-esop-rules","sample_data":true,"title":"ESOP plan rules (sample)","stage":"S2","analysis_area":"hr_organisation","svi_criterion":"team_structure","stage_coverage":["people"],"produced_by":"Adopted an option plan before the fifth hire so equity conversations stopped being bespoke.","data_room_folder":"2. Cap Table & Equity","data_room_document":"ESOP Plan Rules"}'::jsonb),
    (proj_id, owner_id, 'financial', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 671744,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a16-unit-economics')::bytea), 'hex'),
     'demo/sprocketbay/sb-a16-unit-economics.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-08-15', date '2025-08-15',
     'archived', 'clean', timestamptz '2024-08-15 00:00:00+00',
     '{"demo_artefact_id":"sb-a16-unit-economics","sample_data":true,"title":"Unit economics model — LTV / CAC (sample)","stage":"S2","analysis_area":"financial_health","svi_criterion":null,"stage_coverage":["finance_baseline","revenue"],"produced_by":"Replaced the blended CAC guess with a cohort-derived payback period, which changed the pricing decision.","data_room_folder":"3. Financial Projections","data_room_document":"Unit Economics Model"}'::jsonb),
    (proj_id, owner_id, 'traction', 'application/pdf', 995328,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a17-traction-dashboard')::bytea), 'hex'),
     'demo/sprocketbay/sb-a17-traction-dashboard.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-09-19', date '2025-09-19',
     'archived', 'clean', timestamptz '2024-09-19 00:00:00+00',
     '{"demo_artefact_id":"sb-a17-traction-dashboard","sample_data":true,"title":"Traction dashboard export (sample)","stage":"S2","analysis_area":"business_performance_kpis","svi_criterion":null,"stage_coverage":["customers"],"produced_by":"Wired the product analytics export so activation and week-4 retention stopped being screenshots.","data_room_folder":"5. Market & Traction","data_room_document":"Traction Dashboard"}'::jsonb),
    (proj_id, owner_id, 'compliance', 'application/pdf', 268390,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a18-privacy-policy')::bytea), 'hex'),
     'demo/sprocketbay/sb-a18-privacy-policy.placeholder', 'public',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-11-05', date '2026-11-05',
     'verified', 'clean', timestamptz '2024-11-05 00:00:00+00',
     '{"demo_artefact_id":"sb-a18-privacy-policy","sample_data":true,"title":"Privacy policy & APP compliance statement (sample)","stage":"S3","analysis_area":"governance_risk_compliance","svi_criterion":"documents","stage_coverage":["compliance"],"produced_by":"Published a privacy policy mapped to the Australian Privacy Principles once the first enterprise buyer sent a security questionnaire.","data_room_folder":"7. IP & Compliance","data_room_document":"Privacy Policy"}'::jsonb),
    (proj_id, owner_id, 'ip', 'application/pdf', 3412889,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a19-ip-assignment')::bytea), 'hex'),
     'demo/sprocketbay/sb-a19-ip-assignment.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2024-12-12', NULL,
     'verified', 'clean', timestamptz '2024-12-12 00:00:00+00',
     '{"demo_artefact_id":"sb-a19-ip-assignment","sample_data":true,"title":"IP assignment deeds — contractors (sample)","stage":"S3","analysis_area":"governance_risk_compliance","svi_criterion":"documents","stage_coverage":["ip"],"produced_by":"Chased down assignment deeds from every contractor who had touched the codebase, including two who had already rolled off.","data_room_folder":"7. IP & Compliance","data_room_document":"IP Assignment Deeds (Contractors)"}'::jsonb),
    (proj_id, owner_id, 'compliance', 'application/pdf', 58112,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a20-litigation-register')::bytea), 'hex'),
     'demo/sprocketbay/sb-a20-litigation-register.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2025-01-16', date '2026-01-16',
     'archived', 'clean', timestamptz '2025-01-16 00:00:00+00',
     '{"demo_artefact_id":"sb-a20-litigation-register","sample_data":true,"title":"Litigation & disputes register — nil return (sample)","stage":"S3","analysis_area":"governance_risk_compliance","svi_criterion":"documents","stage_coverage":["risk"],"produced_by":"Opened a disputes register and recorded a nil return, so ''none'' became a dated statement instead of an absence.","data_room_folder":"8. Contracts & Agreements","data_room_document":"Litigation & Disputes Register"}'::jsonb),
    (proj_id, owner_id, 'security', 'application/pdf', 4120576,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a21-security-audit')::bytea), 'hex'),
     'demo/sprocketbay/sb-a21-security-audit.placeholder', 'restricted',
     'Redgum Cloud Partners (sample)', date '2025-02-11', date '2026-02-11',
     'archived', 'clean', timestamptz '2025-02-11 00:00:00+00',
     '{"demo_artefact_id":"sb-a21-security-audit","sample_data":true,"title":"Security audit / penetration test report (sample)","stage":"S3","analysis_area":"technology_architecture","svi_criterion":"code_git","stage_coverage":["risk","product"],"produced_by":"Commissioned an external penetration test and fixed the two high findings before publishing the report to the data room.","data_room_folder":"4. Product & Technology","data_room_document":"Security Audit / Pen Test Report"}'::jsonb),
    (proj_id, owner_id, 'people', 'application/pdf', 214016,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a22-org-chart')::bytea), 'hex'),
     'demo/sprocketbay/sb-a22-org-chart.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2025-03-04', date '2026-03-04',
     'archived', 'clean', timestamptz '2025-03-04 00:00:00+00',
     '{"demo_artefact_id":"sb-a22-org-chart","sample_data":true,"title":"Organisational chart — 19 people (sample)","stage":"S3","analysis_area":"hr_organisation","svi_criterion":"team_structure","stage_coverage":["people"],"produced_by":"Drew the org chart honestly, including the three roles that were one person wearing two hats.","data_room_folder":"6. Team & Advisors","data_room_document":"Organisational Chart"}'::jsonb),
    (proj_id, owner_id, 'contract', 'application/pdf', 5284352,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a23-key-customer-contracts')::bytea), 'hex'),
     'demo/sprocketbay/sb-a23-key-customer-contracts.placeholder', 'highly_sensitive',
     'Sprocketbay Demo Co (Sample Profile)', date '2025-03-27', NULL,
     'verified', 'clean', timestamptz '2025-03-27 00:00:00+00',
     '{"demo_artefact_id":"sb-a23-key-customer-contracts","sample_data":true,"title":"Key customer contracts — top 3 by ACV (sample)","stage":"S3","analysis_area":"revenue_model_sales","svi_criterion":"revenue","stage_coverage":["revenue","customers"],"produced_by":"Uploaded the three largest customer agreements after redacting the counterparties'' pricing schedules.","data_room_folder":"8. Contracts & Agreements","data_room_document":"Key Customer Contracts (Top 3 by ACV)"}'::jsonb),
    (proj_id, owner_id, 'financial', 'application/pdf', 6291456,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a24-audited-financials')::bytea), 'hex'),
     'demo/sprocketbay/sb-a24-audited-financials.placeholder', 'restricted',
     'Harbourfield Assurance (sample)', date '2025-09-30', date '2026-09-30',
     'verified', 'clean', timestamptz '2025-09-30 00:00:00+00',
     '{"demo_artefact_id":"sb-a24-audited-financials","sample_data":true,"title":"Audited financial statements — FY24 (sample)","stage":"S4","analysis_area":"financial_health","svi_criterion":null,"stage_coverage":["finance_baseline","revenue"],"produced_by":"Engaged an external assurance firm for the first full-scope audit; the FY24 opinion is what moved the ladder to attested.","data_room_folder":"3. Financial Projections","data_room_document":"Audited Financial Statements (3 years)"}'::jsonb),
    (proj_id, owner_id, 'governance', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 92160,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a25-secondary-register')::bytea), 'hex'),
     'demo/sprocketbay/sb-a25-secondary-register.placeholder', 'highly_sensitive',
     'Sprocketbay Demo Co (Sample Profile)', date '2025-10-21', NULL,
     'verified', 'clean', timestamptz '2025-10-21 00:00:00+00',
     '{"demo_artefact_id":"sb-a25-secondary-register","sample_data":true,"title":"Secondary transactions register (sample)","stage":"S4","analysis_area":"founder_leadership","svi_criterion":"founder_profile","stage_coverage":["ownership"],"produced_by":"Ran an employee-liquidity secondary — no primary capital raised — and recorded every transfer against the share register.","data_room_folder":"2. Cap Table & Equity","data_room_document":"Secondary Transactions Register"}'::jsonb),
    (proj_id, owner_id, 'esg', 'application/pdf', 402432,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a26-modern-slavery')::bytea), 'hex'),
     'demo/sprocketbay/sb-a26-modern-slavery.placeholder', 'public',
     'Sprocketbay Demo Co (Sample Profile)', date '2025-11-18', date '2026-11-18',
     'verified', 'clean', timestamptz '2025-11-18 00:00:00+00',
     '{"demo_artefact_id":"sb-a26-modern-slavery","sample_data":true,"title":"Modern slavery statement (sample)","stage":"S4","analysis_area":"governance_risk_compliance","svi_criterion":"documents","stage_coverage":["sustainability"],"produced_by":"Wrote a supply-chain statement covering the cloud and contractor spend, because procurement reviewers started asking for one.","data_room_folder":"12. AU Compliance","data_room_document":"Modern Slavery Act Statement"}'::jsonb),
    (proj_id, owner_id, 'traction', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1048576,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a27-cohort-analysis')::bytea), 'hex'),
     'demo/sprocketbay/sb-a27-cohort-analysis.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2025-12-15', date '2026-12-15',
     'verified', 'clean', timestamptz '2025-12-15 00:00:00+00',
     '{"demo_artefact_id":"sb-a27-cohort-analysis","sample_data":true,"title":"Cohort revenue analysis — 24 months (sample)","stage":"S4","analysis_area":"business_performance_kpis","svi_criterion":null,"stage_coverage":["customers","data_moat"],"produced_by":"Built the retained-revenue cohort view that turned two years of usage logs into a defensible expansion curve.","data_room_folder":"3. Financial Projections","data_room_document":"Cohort Revenue Analysis"}'::jsonb),
    (proj_id, owner_id, 'security', 'application/json', 786432,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a28-dependency-inventory')::bytea), 'hex'),
     'demo/sprocketbay/sb-a28-dependency-inventory.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2026-01-27', date '2027-01-27',
     'verified', 'clean', timestamptz '2026-01-27 00:00:00+00',
     '{"demo_artefact_id":"sb-a28-dependency-inventory","sample_data":true,"title":"Third-party dependency inventory (sample)","stage":"S4","analysis_area":"technology_architecture","svi_criterion":"code_git","stage_coverage":["data_moat","risk"],"produced_by":"Generated an SBOM and licence inventory so the data moat claim could be separated from the open-source it sits on.","data_room_folder":"4. Product & Technology","data_room_document":"Third-Party Dependency Inventory"}'::jsonb),
    (proj_id, owner_id, 'governance', 'application/pdf', 2621440,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a29-board-minutes')::bytea), 'hex'),
     'demo/sprocketbay/sb-a29-board-minutes.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2026-03-11', date '2027-03-11',
     'verified', 'clean', timestamptz '2026-03-11 00:00:00+00',
     '{"demo_artefact_id":"sb-a29-board-minutes","sample_data":true,"title":"Board minutes — rolling 12 months (sample)","stage":"S5","analysis_area":"governance_risk_compliance","svi_criterion":"documents","stage_coverage":["governance"],"produced_by":"Started circulating minutes within five business days of each meeting, which is the habit listing-grade reporting actually depends on.","data_room_folder":"1. Corporate & Legal","data_room_document":"Board Minutes (Last 12 months)"}'::jsonb),
    (proj_id, owner_id, 'financial', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 3145728,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a30-management-accounts')::bytea), 'hex'),
     'demo/sprocketbay/sb-a30-management-accounts.placeholder', 'restricted',
     'Sprocketbay Demo Co (Sample Profile)', date '2026-04-14', date '2027-04-14',
     'verified', 'clean', timestamptz '2026-04-14 00:00:00+00',
     '{"demo_artefact_id":"sb-a30-management-accounts","sample_data":true,"title":"Monthly management accounts — last 12 months (sample)","stage":"S5","analysis_area":"financial_health","svi_criterion":null,"stage_coverage":["finance_baseline","revenue"],"produced_by":"Closed the books monthly on a fixed calendar and published the pack, instead of rebuilding numbers for each request.","data_room_folder":"3. Financial Projections","data_room_document":"Monthly Management Accounts (Last 12 months)"}'::jsonb),
    (proj_id, owner_id, 'people', 'application/pdf', 176128,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a31-hiring-plan')::bytea), 'hex'),
     'demo/sprocketbay/sb-a31-hiring-plan.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2026-05-06', date '2027-05-06',
     'verified', 'clean', timestamptz '2026-05-06 00:00:00+00',
     '{"demo_artefact_id":"sb-a31-hiring-plan","sample_data":true,"title":"Hiring plan — next 12 months (sample)","stage":"S5","analysis_area":"team_culture","svi_criterion":"team","stage_coverage":["people"],"produced_by":"Mapped the next 12 months of hiring against the two functions that were already the constraint, not the ones that felt exciting.","data_room_folder":"6. Team & Advisors","data_room_document":"Hiring Plan (12 months)"}'::jsonb),
    (proj_id, owner_id, 'product', 'application/pdf', 524288,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a32-uptime-sla')::bytea), 'hex'),
     'demo/sprocketbay/sb-a32-uptime-sla.placeholder', 'public',
     'Sprocketbay Demo Co (Sample Profile)', date '2026-06-02', date '2027-06-02',
     'verified', 'clean', timestamptz '2026-06-02 00:00:00+00',
     '{"demo_artefact_id":"sb-a32-uptime-sla","sample_data":true,"title":"Uptime / SLA history — 12 months (sample)","stage":"S5","analysis_area":"operations_process","svi_criterion":null,"stage_coverage":["product"],"produced_by":"Published a year of uptime against the contractual SLA, including the one month it was missed and what changed after.","data_room_folder":"4. Product & Technology","data_room_document":"Uptime / SLA History (12 months)"}'::jsonb),
    (proj_id, owner_id, 'other', 'application/pdf', 8388608,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a33-press-coverage')::bytea), 'hex'),
     'demo/sprocketbay/sb-a33-press-coverage.placeholder', 'public',
     'Sprocketbay Demo Co (Sample Profile)', date '2026-06-24', NULL,
     'verified', 'clean', timestamptz '2026-06-24 00:00:00+00',
     '{"demo_artefact_id":"sb-a33-press-coverage","sample_data":true,"title":"Press & media coverage pack (sample)","stage":"S5","analysis_area":"marketing_brand","svi_criterion":null,"stage_coverage":[],"produced_by":"Collected the coverage that actually drove signups and dropped the rest, so the brand claim is evidenced rather than asserted.","data_room_folder":"10. References & Due Diligence","data_room_document":"Press & Media Coverage"}'::jsonb),
    (proj_id, owner_id, 'compliance', 'application/pdf', 131072,
     encode(sha256(('blockid-demo:sprocketbay:' || 'sb-a34-continuous-monitoring')::bytea), 'hex'),
     'demo/sprocketbay/sb-a34-continuous-monitoring.placeholder', 'private',
     'Sprocketbay Demo Co (Sample Profile)', date '2026-07-14', date '2027-07-14',
     'validation_required', 'clean', timestamptz '2026-07-14 00:00:00+00',
     '{"demo_artefact_id":"sb-a34-continuous-monitoring","sample_data":true,"title":"Continuous-monitoring connector consent (sample)","stage":"S5","analysis_area":"governance_risk_compliance","svi_criterion":"documents","stage_coverage":["compliance"],"produced_by":"Started the L5 step: authorising BlockID to re-check the registry, the accounting ledger and the audit opinion on a schedule. Sitting with a reviewer as at the walkthrough date.","data_room_folder":"10. References & Due Diligence","data_room_document":"Due Diligence Checklist (Auto-generated)"}'::jsonb);

  DELETE FROM public.data_room_documents WHERE data_room_id = room_id;

  INSERT INTO public.data_room_documents (
    data_room_id, account_id, section, folder, document_name,
    document_type, status, priority, notes, completed_at
  ) VALUES
    (room_id, owner_id, 'team', '6. Team & Advisors', 'Founder Profiles',
     'template', 'complete', 'P0', 'SAMPLE DATA — S0. Completed the identity step in onboarding: government-ID capture plus a liveness check, then confirmed the account email.',
     timestamptz '2024-02-06 00:00:00+00'),
    (room_id, owner_id, 'corporate', '1. Corporate & Legal', 'Certificate of Registration',
     'upload', 'complete', 'P0', 'SAMPLE DATA — S0. Uploaded the incorporation certificate issued when the Pty Ltd was registered.',
     timestamptz '2024-02-07 00:00:00+00'),
    (room_id, owner_id, 'captable', '2. Cap Table & Equity', 'Founder Agreements & Vesting Schedules',
     'template', 'complete', 'P0', 'SAMPLE DATA — S0. Signed founder agreements with a 4-year vest and a 12-month cliff before any code was written.',
     timestamptz '2024-02-09 00:00:00+00'),
    (room_id, owner_id, 'traction', '5. Market & Traction', 'Customer Discovery Interview Log',
     'template', 'complete', 'P1', 'SAMPLE DATA — S0. Ran 14 recorded discovery calls with platform engineers and wrote up the pain points that repeated in more than half of them.',
     timestamptz '2024-02-16 00:00:00+00'),
    (room_id, owner_id, 'corporate', '1. Corporate & Legal', 'Constitution or Replaceable Rules',
     'upload', 'complete', 'P0', 'SAMPLE DATA — S1. Adopted a constitution instead of the replaceable rules so the share classes and pre-emption terms were settled before the first hire.',
     timestamptz '2024-02-22 00:00:00+00'),
    (room_id, owner_id, 'corporate', '1. Corporate & Legal', 'Register of Directors & Secretaries',
     'upload', 'complete', 'P1', 'SAMPLE DATA — S1. Recorded both directors and the company secretary, with consents to act attached.',
     timestamptz '2024-02-23 00:00:00+00'),
    (room_id, owner_id, 'financial', '3. Financial Projections', 'Financial Model (3-Year Projection)',
     'template', 'complete', 'P0', 'SAMPLE DATA — S1. Superseded by a later version; the evidence row is archived. Built the first bottom-up model: seats × price × conversion, with the cost base driven off headcount rather than a growth percentage.',
     timestamptz '2024-03-05 00:00:00+00'),
    (room_id, owner_id, 'ip', '7. IP & Compliance', 'Domain Name Register',
     'upload', 'complete', 'P2', 'SAMPLE DATA — S1. Proved control of the primary domain with a DNS TXT record, which is what moves the ladder past self-declared.',
     timestamptz '2024-03-09 00:00:00+00'),
    (room_id, owner_id, 'product', '4. Product & Technology', 'Technical Architecture',
     'template', 'complete', 'P1', 'SAMPLE DATA — S1. Wrote down the MVP architecture, the data model and the two decisions that would be expensive to reverse later.',
     timestamptz '2024-03-20 00:00:00+00'),
    (room_id, owner_id, 'corporate', '1. Corporate & Legal', 'Pitch Deck',
     'upload', 'complete', 'P0', 'SAMPLE DATA — S1. Superseded by a later version; the evidence row is archived. Assembled the first deck — problem, wedge, the 14 interviews, and an explicit note that there was no revenue yet.',
     timestamptz '2024-04-02 00:00:00+00'),
    (room_id, owner_id, 'financial', '3. Financial Projections', 'Revenue Proof (Stripe / Bank)',
     'connect', 'complete', 'P0', 'SAMPLE DATA — S2. Superseded by a later version; the evidence row is archived. Connected the payment processor and exported the first two quarters of settled invoices rather than typing MRR into a slide.',
     timestamptz '2024-05-08 00:00:00+00'),
    (room_id, owner_id, 'strategy', '9. Strategy & Roadmap', 'Go-to-Market Strategy',
     'template', 'complete', 'P0', 'SAMPLE DATA — S2. Documented the low-touch motion: docs-led acquisition, no outbound team, and the two channels that were allowed to consume budget.',
     timestamptz '2024-05-22 00:00:00+00'),
    (room_id, owner_id, 'traction', '5. Market & Traction', 'Top-20 Customer Revenue Concentration',
     'upload', 'complete', 'P1', 'SAMPLE DATA — S2. Superseded by a later version; the evidence row is archived. Pulled revenue by account to check whether the self-serve motion had quietly become dependent on a handful of logos.',
     timestamptz '2024-06-14 00:00:00+00'),
    (room_id, owner_id, 'captable', '2. Cap Table & Equity', 'Shareholders Agreement',
     'template', 'complete', 'P0', 'SAMPLE DATA — S2. Executed a shareholders agreement covering drag/tag, reserved matters and what happens if a founder leaves.',
     timestamptz '2024-06-27 00:00:00+00'),
    (room_id, owner_id, 'captable', '2. Cap Table & Equity', 'ESOP Plan Rules',
     'upload', 'complete', 'P1', 'SAMPLE DATA — S2. Adopted an option plan before the fifth hire so equity conversations stopped being bespoke.',
     timestamptz '2024-07-30 00:00:00+00'),
    (room_id, owner_id, 'financial', '3. Financial Projections', 'Unit Economics Model',
     'upload', 'complete', 'P1', 'SAMPLE DATA — S2. Superseded by a later version; the evidence row is archived. Replaced the blended CAC guess with a cohort-derived payback period, which changed the pricing decision.',
     timestamptz '2024-08-15 00:00:00+00'),
    (room_id, owner_id, 'traction', '5. Market & Traction', 'Traction Dashboard',
     'auto', 'complete', 'P0', 'SAMPLE DATA — S2. Superseded by a later version; the evidence row is archived. Wired the product analytics export so activation and week-4 retention stopped being screenshots.',
     timestamptz '2024-09-19 00:00:00+00'),
    (room_id, owner_id, 'ip', '7. IP & Compliance', 'Privacy Policy',
     'connect', 'complete', 'P0', 'SAMPLE DATA — S3. Published a privacy policy mapped to the Australian Privacy Principles once the first enterprise buyer sent a security questionnaire.',
     timestamptz '2024-11-05 00:00:00+00'),
    (room_id, owner_id, 'ip', '7. IP & Compliance', 'IP Assignment Deeds (Contractors)',
     'upload', 'complete', 'P0', 'SAMPLE DATA — S3. Chased down assignment deeds from every contractor who had touched the codebase, including two who had already rolled off.',
     timestamptz '2024-12-12 00:00:00+00'),
    (room_id, owner_id, 'contracts', '8. Contracts & Agreements', 'Litigation & Disputes Register',
     'upload', 'complete', 'P0', 'SAMPLE DATA — S3. Superseded by a later version; the evidence row is archived. Opened a disputes register and recorded a nil return, so ''none'' became a dated statement instead of an absence.',
     timestamptz '2025-01-16 00:00:00+00'),
    (room_id, owner_id, 'product', '4. Product & Technology', 'Security Audit / Pen Test Report',
     'upload', 'complete', 'P2', 'SAMPLE DATA — S3. Superseded by a later version; the evidence row is archived. Commissioned an external penetration test and fixed the two high findings before publishing the report to the data room.',
     timestamptz '2025-02-11 00:00:00+00'),
    (room_id, owner_id, 'team', '6. Team & Advisors', 'Organisational Chart',
     'upload', 'complete', 'P1', 'SAMPLE DATA — S3. Superseded by a later version; the evidence row is archived. Drew the org chart honestly, including the three roles that were one person wearing two hats.',
     timestamptz '2025-03-04 00:00:00+00'),
    (room_id, owner_id, 'contracts', '8. Contracts & Agreements', 'Key Customer Contracts (Top 3 by ACV)',
     'upload', 'complete', 'P0', 'SAMPLE DATA — S3. Uploaded the three largest customer agreements after redacting the counterparties'' pricing schedules.',
     timestamptz '2025-03-27 00:00:00+00'),
    (room_id, owner_id, 'financial', '3. Financial Projections', 'Audited Financial Statements (3 years)',
     'upload', 'complete', 'P2', 'SAMPLE DATA — S4. Engaged an external assurance firm for the first full-scope audit; the FY24 opinion is what moved the ladder to attested.',
     timestamptz '2025-09-30 00:00:00+00'),
    (room_id, owner_id, 'captable', '2. Cap Table & Equity', 'Secondary Transactions Register',
     'upload', 'complete', 'P2', 'SAMPLE DATA — S4. Ran an employee-liquidity secondary — no primary capital raised — and recorded every transfer against the share register.',
     timestamptz '2025-10-21 00:00:00+00'),
    (room_id, owner_id, 'au_compliance', '12. AU Compliance', 'Modern Slavery Act Statement',
     'upload', 'complete', 'P2', 'SAMPLE DATA — S4. Wrote a supply-chain statement covering the cloud and contractor spend, because procurement reviewers started asking for one.',
     timestamptz '2025-11-18 00:00:00+00'),
    (room_id, owner_id, 'financial', '3. Financial Projections', 'Cohort Revenue Analysis',
     'upload', 'complete', 'P1', 'SAMPLE DATA — S4. Built the retained-revenue cohort view that turned two years of usage logs into a defensible expansion curve.',
     timestamptz '2025-12-15 00:00:00+00'),
    (room_id, owner_id, 'product', '4. Product & Technology', 'Third-Party Dependency Inventory',
     'upload', 'complete', 'P1', 'SAMPLE DATA — S4. Generated an SBOM and licence inventory so the data moat claim could be separated from the open-source it sits on.',
     timestamptz '2026-01-27 00:00:00+00'),
    (room_id, owner_id, 'corporate', '1. Corporate & Legal', 'Board Minutes (Last 12 months)',
     'upload', 'complete', 'P1', 'SAMPLE DATA — S5. Started circulating minutes within five business days of each meeting, which is the habit listing-grade reporting actually depends on.',
     timestamptz '2026-03-11 00:00:00+00'),
    (room_id, owner_id, 'financial', '3. Financial Projections', 'Monthly Management Accounts (Last 12 months)',
     'upload', 'complete', 'P1', 'SAMPLE DATA — S5. Closed the books monthly on a fixed calendar and published the pack, instead of rebuilding numbers for each request.',
     timestamptz '2026-04-14 00:00:00+00'),
    (room_id, owner_id, 'team', '6. Team & Advisors', 'Hiring Plan (12 months)',
     'upload', 'complete', 'P1', 'SAMPLE DATA — S5. Mapped the next 12 months of hiring against the two functions that were already the constraint, not the ones that felt exciting.',
     timestamptz '2026-05-06 00:00:00+00'),
    (room_id, owner_id, 'product', '4. Product & Technology', 'Uptime / SLA History (12 months)',
     'upload', 'complete', 'P1', 'SAMPLE DATA — S5. Published a year of uptime against the contractual SLA, including the one month it was missed and what changed after.',
     timestamptz '2026-06-02 00:00:00+00'),
    (room_id, owner_id, 'references', '10. References & Due Diligence', 'Press & Media Coverage',
     'upload', 'complete', 'P2', 'SAMPLE DATA — S5. Collected the coverage that actually drove signups and dropped the rest, so the brand claim is evidenced rather than asserted.',
     timestamptz '2026-06-24 00:00:00+00'),
    (room_id, owner_id, 'references', '10. References & Due Diligence', 'Due Diligence Checklist (Auto-generated)',
     'auto', 'pending', 'P0', 'SAMPLE DATA — S5. Started the L5 step: authorising BlockID to re-check the registry, the accounting ledger and the audit opinion on a schedule. Sitting with a reviewer as at the walkthrough date.',
     timestamptz '2026-07-14 00:00:00+00');

  INSERT INTO public.evaluation_criteria (
    account_id, project_id, criterion_key, files, links,
    text_input, ai_score, ai_summary,
    quality_level, primary_dimension, secondary_dimension, signals_extracted
  ) VALUES
    (acct_id, proj_id, 'idea', '[{"name":"idea-evidence-1 (sample)","sample_data":true},{"name":"idea-evidence-2 (sample)","sample_data":true},{"name":"idea-evidence-3 (sample)","sample_data":true}]'::jsonb, '[{"label":"Product Hunt (sample)","sample_data":true},{"label":"Landing page (sample)","sample_data":true},{"label":"Demo video (sample)","sample_data":true}]'::jsonb,
     'Category position is now something customers describe back unprompted, which is the only version of positioning that counts.', 88, 'SAMPLE DATA — weighted 10% of the composite. Uniqueness, problem-solution fit, innovation level.',
     'exceptional', 'mpc', 'svm',
     '{"sample_data":true,"weight":10,"files":3,"links":3}'::jsonb),
    (acct_id, proj_id, 'market', '[{"name":"market-evidence-1 (sample)","sample_data":true},{"name":"market-evidence-2 (sample)","sample_data":true},{"name":"market-evidence-3 (sample)","sample_data":true},{"name":"market-evidence-4 (sample)","sample_data":true}]'::jsonb, '[{"label":"Market research report (sample)","sample_data":true},{"label":"Industry analysis (sample)","sample_data":true},{"label":"ABS data (sample)","sample_data":true}]'::jsonb,
     'Sizing, competitive set and the reasons the estimate could be wrong are all published in the same document.', 83, 'SAMPLE DATA — weighted 12% of the composite. TAM/SAM/SOM, timing, competitive landscape.',
     'exceptional', 'mpc', 'tre',
     '{"sample_data":true,"weight":12,"files":4,"links":3}'::jsonb),
    (acct_id, proj_id, 'founder_profile', '[{"name":"founder_profile-evidence-1 (sample)","sample_data":true},{"name":"founder_profile-evidence-2 (sample)","sample_data":true}]'::jsonb, '[{"label":"LinkedIn profile (sample)","sample_data":true},{"label":"Personal website (sample)","sample_data":true}]'::jsonb,
     'Unchanged from S4 by design — see above. A fixture that quietly inflated this to keep the line rising would be the dishonest option.', 79, 'SAMPLE DATA — weighted 8% of the composite. Background, track record, vision, domain expertise.',
     'strong', 'ftv', NULL,
     '{"sample_data":true,"weight":8,"files":2,"links":2}'::jsonb),
    (acct_id, proj_id, 'code_git', '[{"name":"code_git-evidence-1 (sample)","sample_data":true},{"name":"code_git-evidence-2 (sample)","sample_data":true},{"name":"code_git-evidence-3 (sample)","sample_data":true},{"name":"code_git-evidence-4 (sample)","sample_data":true}]'::jsonb, '[{"label":"GitHub repo (sample)","sample_data":true},{"label":"GitLab repo (sample)","sample_data":true},{"label":"Bitbucket repo (sample)","sample_data":true}]'::jsonb,
     'Coverage 83%, SBOM regenerated per release, security review cadence contractual rather than ad hoc.', 90, 'SAMPLE DATA — weighted 6% of the composite. Code quality, architecture, commit history, test coverage.',
     'exceptional', 'ptd', NULL,
     '{"sample_data":true,"weight":6,"files":4,"links":3}'::jsonb),
    (acct_id, proj_id, 'website', '[{"name":"website-evidence-1 (sample)","sample_data":true},{"name":"website-evidence-2 (sample)","sample_data":true}]'::jsonb, '[{"label":"Website URL (sample)","sample_data":true},{"label":"App Store link (sample)","sample_data":true},{"label":"Google Play link (sample)","sample_data":true}]'::jsonb,
     'Trust surface is complete enough that the public BlockID profile is linked from the footer rather than buried.', 85, 'SAMPLE DATA — weighted 5% of the composite. Design quality, UX, performance, SEO, conversion.',
     'exceptional', 'ptd', 'tre',
     '{"sample_data":true,"weight":5,"files":2,"links":3}'::jsonb),
    (acct_id, proj_id, 'team', '[{"name":"team-evidence-1 (sample)","sample_data":true},{"name":"team-evidence-2 (sample)","sample_data":true},{"name":"team-evidence-3 (sample)","sample_data":true}]'::jsonb, '[{"label":"Team page (sample)","sample_data":true},{"label":"LinkedIn profiles (sample)","sample_data":true},{"label":"Team page (sample)","sample_data":true}]'::jsonb,
     'Forty-four people. The constraint is now hiring speed in two functions, which the hiring plan names explicitly.', 78, 'SAMPLE DATA — weighted 8% of the composite. Skills, complementary expertise, hiring plan.',
     'strong', 'ftv', 'cgh',
     '{"sample_data":true,"weight":8,"files":3,"links":3}'::jsonb),
    (acct_id, proj_id, 'customer_size', '[{"name":"customer_size-evidence-1 (sample)","sample_data":true},{"name":"customer_size-evidence-2 (sample)","sample_data":true},{"name":"customer_size-evidence-3 (sample)","sample_data":true},{"name":"customer_size-evidence-4 (sample)","sample_data":true},{"name":"customer_size-evidence-5 (sample)","sample_data":true}]'::jsonb, '[{"label":"Google Analytics (sample)","sample_data":true},{"label":"Mixpanel (sample)","sample_data":true},{"label":"Amplitude (sample)","sample_data":true}]'::jsonb,
     'Retention, expansion and concentration are all published from the same source of truth the board pack uses.', 80, 'SAMPLE DATA — weighted 10% of the composite. User base, growth rate, engagement metrics.',
     'exceptional', 'tre', NULL,
     '{"sample_data":true,"weight":10,"files":5,"links":3}'::jsonb),
    (acct_id, proj_id, 'gtm_strategy', '[{"name":"gtm_strategy-evidence-1 (sample)","sample_data":true},{"name":"gtm_strategy-evidence-2 (sample)","sample_data":true},{"name":"gtm_strategy-evidence-3 (sample)","sample_data":true}]'::jsonb, '[{"label":"Marketing site (sample)","sample_data":true},{"label":"Social media profiles (sample)","sample_data":true},{"label":"Marketing site (sample)","sample_data":true}]'::jsonb,
     'Lowest score on the board, and correctly so: the motion works but has never been tested outside its original segment.', 74, 'SAMPLE DATA — weighted 8% of the composite. Distribution channels, pricing, acquisition strategy.',
     'strong', 'mpc', 'tre',
     '{"sample_data":true,"weight":8,"files":3,"links":3}'::jsonb),
    (acct_id, proj_id, 'documents', '[{"name":"documents-evidence-1 (sample)","sample_data":true},{"name":"documents-evidence-2 (sample)","sample_data":true},{"name":"documents-evidence-3 (sample)","sample_data":true},{"name":"documents-evidence-4 (sample)","sample_data":true},{"name":"documents-evidence-5 (sample)","sample_data":true},{"name":"documents-evidence-6 (sample)","sample_data":true},{"name":"documents-evidence-7 (sample)","sample_data":true},{"name":"documents-evidence-8 (sample)","sample_data":true},{"name":"documents-evidence-9 (sample)","sample_data":true},{"name":"documents-evidence-10 (sample)","sample_data":true},{"name":"documents-evidence-11 (sample)","sample_data":true},{"name":"documents-evidence-12 (sample)","sample_data":true},{"name":"documents-evidence-13 (sample)","sample_data":true},{"name":"documents-evidence-14 (sample)","sample_data":true},{"name":"documents-evidence-15 (sample)","sample_data":true}]'::jsonb, '[{"label":"Google Drive data room (sample)","sample_data":true},{"label":"DocSend link (sample)","sample_data":true}]'::jsonb,
     'Board minutes on a five-day cycle and monthly management accounts on a fixed calendar. Listing-grade reporting is a habit, not a project.', 83, 'SAMPLE DATA — weighted 7% of the composite. Pitch deck, business plan, financial projections.',
     'exceptional', 'iri', 'lco',
     '{"sample_data":true,"weight":7,"files":15,"links":2}'::jsonb),
    (acct_id, proj_id, 'dataroom', '[{"name":"dataroom-evidence-1 (sample)","sample_data":true},{"name":"dataroom-evidence-2 (sample)","sample_data":true},{"name":"dataroom-evidence-3 (sample)","sample_data":true},{"name":"dataroom-evidence-4 (sample)","sample_data":true},{"name":"dataroom-evidence-5 (sample)","sample_data":true},{"name":"dataroom-evidence-6 (sample)","sample_data":true},{"name":"dataroom-evidence-7 (sample)","sample_data":true},{"name":"dataroom-evidence-8 (sample)","sample_data":true},{"name":"dataroom-evidence-9 (sample)","sample_data":true},{"name":"dataroom-evidence-10 (sample)","sample_data":true},{"name":"dataroom-evidence-11 (sample)","sample_data":true},{"name":"dataroom-evidence-12 (sample)","sample_data":true},{"name":"dataroom-evidence-13 (sample)","sample_data":true},{"name":"dataroom-evidence-14 (sample)","sample_data":true},{"name":"dataroom-evidence-15 (sample)","sample_data":true},{"name":"dataroom-evidence-16 (sample)","sample_data":true},{"name":"dataroom-evidence-17 (sample)","sample_data":true},{"name":"dataroom-evidence-18 (sample)","sample_data":true}]'::jsonb, '[{"label":"Data room URL (sample)","sample_data":true},{"label":"Google Drive folder (sample)","sample_data":true},{"label":"Data room URL (sample)","sample_data":true}]'::jsonb,
     'Every section current, with an owner and a review date per section rather than a single ''last updated'' stamp.', 86, 'SAMPLE DATA — weighted 5% of the composite. Completeness, organization, investor-readiness.',
     'exceptional', 'iri', 'cgh',
     '{"sample_data":true,"weight":5,"files":18,"links":3}'::jsonb),
    (acct_id, proj_id, 'team_structure', '[{"name":"team_structure-evidence-1 (sample)","sample_data":true},{"name":"team_structure-evidence-2 (sample)","sample_data":true},{"name":"team_structure-evidence-3 (sample)","sample_data":true}]'::jsonb, '[{"label":"Org chart link (sample)","sample_data":true},{"label":"Advisory board profiles (sample)","sample_data":true}]'::jsonb,
     'Committee charters adopted. Independent chair still not appointed — the single biggest governance gap and it is on the register.', 76, 'SAMPLE DATA — weighted 5% of the composite. Org chart, roles, advisory board, governance.',
     'strong', 'ftv', 'cgh',
     '{"sample_data":true,"weight":5,"files":3,"links":2}'::jsonb),
    (acct_id, proj_id, 'roadmap', '[{"name":"roadmap-evidence-1 (sample)","sample_data":true},{"name":"roadmap-evidence-2 (sample)","sample_data":true},{"name":"roadmap-evidence-3 (sample)","sample_data":true}]'::jsonb, '[{"label":"Trello board (sample)","sample_data":true},{"label":"Jira board (sample)","sample_data":true},{"label":"Linear project (sample)","sample_data":true}]'::jsonb,
     'Roadmap, cohort data and the financial model are reconciled to each other; a change in one now forces a change in the others.', 80, 'SAMPLE DATA — weighted 6% of the composite. Milestones, timeline, execution plan, priorities.',
     'exceptional', 'svm', 'ptd',
     '{"sample_data":true,"weight":6,"files":3,"links":3}'::jsonb),
    (acct_id, proj_id, 'revenue', '[{"name":"revenue-evidence-1 (sample)","sample_data":true},{"name":"revenue-evidence-2 (sample)","sample_data":true},{"name":"revenue-evidence-3 (sample)","sample_data":true},{"name":"revenue-evidence-4 (sample)","sample_data":true},{"name":"revenue-evidence-5 (sample)","sample_data":true}]'::jsonb, '[{"label":"Stripe dashboard (sample)","sample_data":true},{"label":"Xero (sample)","sample_data":true},{"label":"QuickBooks (sample)","sample_data":true}]'::jsonb,
     'Two consecutive audited years. Unit economics stable across cohorts, which is what makes the projection worth reading.', 77, 'SAMPLE DATA — weighted 10% of the composite. Revenue model, MRR/ARR, margins, growth trajectory.',
     'strong', 'tre', 'iri',
     '{"sample_data":true,"weight":10,"files":5,"links":3}'::jsonb)
  ON CONFLICT (account_id, criterion_key) DO UPDATE
    SET project_id          = EXCLUDED.project_id,
        files               = EXCLUDED.files,
        links               = EXCLUDED.links,
        text_input          = EXCLUDED.text_input,
        ai_score            = EXCLUDED.ai_score,
        ai_summary          = EXCLUDED.ai_summary,
        quality_level       = EXCLUDED.quality_level,
        primary_dimension   = EXCLUDED.primary_dimension,
        secondary_dimension = EXCLUDED.secondary_dimension,
        signals_extracted   = EXCLUDED.signals_extracted,
        updated_at          = now();

  DELETE FROM public.business_stage_progress WHERE business_id = proj_id;

  INSERT INTO public.business_stage_progress (
    business_id, current_stage_id, stage_entered_at, stage_exit_target_at,
    stage_exited_at, on_track, open_blockers, last_evaluated_at, metadata
  ) VALUES
    (proj_id, 'S0', timestamptz '2024-02-05 00:00:00+00',
     timestamptz '2024-02-19 00:00:00+00',
     timestamptz '2024-02-18 00:00:00+00',
     true, 0,
     timestamptz '2026-07-20 00:00:00+00', '{"sample_data":true,"trust_score":20.4,"verification_level":1,"exit_trust_score":20,"exit_verification_level":1,"growth_phases":["vision","customer_dev"],"artefact_count":4,"covered_areas":["identity","ownership"],"can_advance":true,"blockers":[],"exit_output":"Genesis Certificate PDF"}'::jsonb),
    (proj_id, 'S1', timestamptz '2024-02-19 00:00:00+00',
     timestamptz '2024-04-19 00:00:00+00',
     timestamptz '2024-04-14 00:00:00+00',
     true, 0,
     timestamptz '2026-07-20 00:00:00+00', '{"sample_data":true,"trust_score":40.65,"verification_level":2,"exit_trust_score":40,"exit_verification_level":2,"growth_phases":["revenue_model","pitch"],"artefact_count":6,"covered_areas":["finance_baseline","governance","identity","ownership","product"],"can_advance":true,"blockers":[],"exit_output":"Foundation Trust Report (free preview)"}'::jsonb),
    (proj_id, 'S2', timestamptz '2024-04-15 00:00:00+00',
     timestamptz '2024-10-12 00:00:00+00',
     timestamptz '2024-10-11 00:00:00+00',
     true, 0,
     timestamptz '2026-07-20 00:00:00+00', '{"sample_data":true,"trust_score":64.18,"verification_level":3,"exit_trust_score":60,"exit_verification_level":3,"growth_phases":["mentor_review","legal_equity","go_to_market"],"artefact_count":7,"covered_areas":["customers","finance_baseline","governance","gtm","identity","ownership","people","product","revenue"],"can_advance":true,"blockers":[],"exit_output":"Traction Trust Business Report (A$5 / credits)"}'::jsonb),
    (proj_id, 'S3', timestamptz '2024-10-12 00:00:00+00',
     timestamptz '2025-10-12 00:00:00+00',
     timestamptz '2025-04-10 00:00:00+00',
     true, 0,
     timestamptz '2026-07-20 00:00:00+00', '{"sample_data":true,"trust_score":71.3,"verification_level":3,"exit_trust_score":65,"exit_verification_level":3,"growth_phases":["product_dev","investor_review"],"artefact_count":6,"covered_areas":["compliance","customers","finance_baseline","governance","gtm","identity","ip","ownership","people","product","revenue","risk"],"can_advance":true,"blockers":[],"exit_output":"Scale Trust Report v2 + investor share links"}'::jsonb),
    (proj_id, 'S4', timestamptz '2025-04-11 00:00:00+00',
     timestamptz '2027-04-11 00:00:00+00',
     timestamptz '2026-02-25 00:00:00+00',
     true, 0,
     timestamptz '2026-07-20 00:00:00+00', '{"sample_data":true,"trust_score":77.28,"verification_level":4,"exit_trust_score":75,"exit_verification_level":4,"growth_phases":["team","growth"],"artefact_count":5,"covered_areas":["compliance","customers","data_moat","finance_baseline","governance","gtm","identity","ip","ownership","people","product","revenue","risk","sustainability"],"can_advance":true,"blockers":[],"exit_output":"Growth-Ready Trust Report + procurement export"}'::jsonb),
    (proj_id, 'S5', timestamptz '2026-02-26 00:00:00+00',
     timestamptz '2299-12-11 00:00:00+00',
     NULL,
     false, 2,
     timestamptz '2026-07-20 00:00:00+00', '{"sample_data":true,"trust_score":81.3,"verification_level":4,"exit_trust_score":85,"exit_verification_level":5,"growth_phases":["funding"],"artefact_count":6,"covered_areas":["compliance","customers","data_moat","finance_baseline","governance","gtm","identity","ip","ownership","people","product","revenue","risk","sustainability"],"can_advance":false,"blockers":["verification_level_below_exit","trust_score_below_exit"],"exit_output":"Unicorn Track Certification (NFT badge)"}'::jsonb);

END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
