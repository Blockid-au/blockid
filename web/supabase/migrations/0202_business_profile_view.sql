-- 0202_business_profile_view.sql
-- Phase 2 Batch F · sub-F1 — Business ID first-class read model.
--
-- Master Upgrade Plan §5.2 migration lane 0200-0202, §11.1 Business ID
-- first-class. This VIEW is the canonical read shape used by the /id/[slug]
-- render path, the sitemap discovery reader, the verification cron demoter,
-- and Stage 4 badge embed endpoints. Writes still go to the underlying
-- `projects` row + additive columns from 0273_public_business_profiles.sql
-- (Agent D); this migration deliberately does NOT introduce a `businesses`
-- table because the dedicated table + FK re-point migration lands in Phase 6
-- as a separate PR (every FK currently pointing at projects.id has to be
-- lifted onto businesses.id in a coordinated single change).
--
-- Column-source map
-- -----------------
--   business_id        = projects.id
--   owner_user_id      = projects.user_id
--   legal_name         = projects.name              (until Phase 6 businesses.legal_name)
--   trading_name       = NULL                       (Phase 6 field; view exposes the shape today)
--   abn                = NULL                       (Phase 6 field; not persisted on projects)
--   acn                = NULL                       (Phase 6 field; not persisted on projects)
--   jurisdiction       = 'AU'                       (Phase 6 field; default until per-business override)
--   slug               = COALESCE(public_slug, slug)   -- public_slug preferred for /id/[slug]
--   verification_level = projects.verification_level   (0273 sub-D1)
--   trust_score        = svi_accounts.current_svi   (per-project via project_id link from 0020)
--   capability_scores  = projects.capability_scores    (0273 sub-D1)
--   public_index       = projects.public_index         (0273 sub-D1)
--   last_verified_at   = projects.last_verified_at     (0273 sub-D1)
--   created_at         = projects.created_at
--
-- Only NON-archived projects are exposed (archived_at IS NULL); consumers
-- reading a deleted / soft-archived project must go direct to `projects`.
--
-- Idempotency: CREATE OR REPLACE VIEW. No BEGIN/COMMIT needed — a single
-- DDL statement + GRANTs.

CREATE OR REPLACE VIEW public.business_profile AS
SELECT
  p.id                              AS business_id,
  p.user_id                         AS owner_user_id,
  p.name                            AS legal_name,
  NULL::text                        AS trading_name,
  NULL::text                        AS abn,
  NULL::text                        AS acn,
  'AU'::text                        AS jurisdiction,
  COALESCE(p.public_slug, p.slug)   AS slug,
  p.verification_level              AS verification_level,
  sa.current_svi                    AS trust_score,
  p.capability_scores               AS capability_scores,
  p.public_index                    AS public_index,
  p.last_verified_at                AS last_verified_at,
  p.created_at                      AS created_at
FROM public.projects p
LEFT JOIN LATERAL (
  SELECT s.current_svi
  FROM public.svi_accounts s
  WHERE s.project_id = p.id
  ORDER BY s.last_active_at DESC NULLS LAST
  LIMIT 1
) sa ON TRUE
WHERE p.archived_at IS NULL;

COMMENT ON VIEW public.business_profile IS
  'Business ID first-class read model; scaffolded on projects until Phase 6 dedicated table.';

GRANT SELECT ON public.business_profile TO authenticated;
GRANT SELECT ON public.business_profile TO service_role;

-- NOTIFY pgrst reload
