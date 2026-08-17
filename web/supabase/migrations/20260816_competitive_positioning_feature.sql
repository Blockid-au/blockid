-- Competitive Positioning Scaffolding Feature
-- Migration: Add competitor features, positioning statements, and analysis metadata
-- Date: 2026-08-16

-- ============================================================================
-- 1. competitor_features table
-- Stores individual features extracted from competitor websites
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.competitor_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  feature_name TEXT NOT NULL,
  feature_category TEXT,  -- 'core' | 'integration' | 'analytics' | 'compliance' | 'support'
  source TEXT,  -- 'website_scrape' | 'ai_analysis' | 'manual_entry'
  confidence_score NUMERIC(3,2),  -- 0.00 to 1.00
  has_founder_feature BOOLEAN,  -- NULL = unknown, true = founder has it, false = doesn't have
  founder_notes TEXT,
  extracted_from_page TEXT,  -- URL or source description
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT confidence_score_range CHECK (
    confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)
  )
);

CREATE INDEX idx_competitor_features_competitor_id
  ON public.competitor_features(competitor_id);
CREATE INDEX idx_competitor_features_category
  ON public.competitor_features(feature_category);
CREATE INDEX idx_competitor_features_source
  ON public.competitor_features(source);

-- Add RLS policy for competitor_features
ALTER TABLE public.competitor_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY competitor_features_select_own
  ON public.competitor_features
  FOR SELECT
  USING (
    competitor_id IN (
      SELECT id FROM public.competitors
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY competitor_features_insert_own
  ON public.competitor_features
  FOR INSERT
  WITH CHECK (
    competitor_id IN (
      SELECT id FROM public.competitors
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY competitor_features_update_own
  ON public.competitor_features
  FOR UPDATE
  USING (
    competitor_id IN (
      SELECT id FROM public.competitors
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    competitor_id IN (
      SELECT id FROM public.competitors
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY competitor_features_delete_own
  ON public.competitor_features
  FOR DELETE
  USING (
    competitor_id IN (
      SELECT id FROM public.competitors
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. positioning_statements table
-- Stores AI-generated and founder-edited positioning statements
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.positioning_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  project_id UUID NOT NULL REFERENCES public.projects(id),
  statement TEXT NOT NULL,  -- Full positioning statement
  category TEXT,  -- e.g., "AI-powered valuation platform"
  target_segment TEXT,  -- e.g., "early-stage AU founders"
  unique_value_prop TEXT,  -- e.g., "with real-time SVI scoring"
  competitor_context_anonymized JSONB,  -- Anonymized competitor data
  confidence_score NUMERIC(3,2),  -- 0.00 to 1.00 (AI confidence)
  generated_by TEXT DEFAULT 'ai',  -- 'ai' | 'founder_edited'
  version_num INT DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT fk_user_project FOREIGN KEY (user_id, project_id)
    REFERENCES public.projects(user_id, id),
  CONSTRAINT confidence_score_range CHECK (
    confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)
  )
);

CREATE INDEX idx_positioning_statements_user_project
  ON public.positioning_statements(user_id, project_id);
CREATE INDEX idx_positioning_statements_created_at
  ON public.positioning_statements(created_at DESC);

-- Add RLS policy for positioning_statements
ALTER TABLE public.positioning_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY positioning_statements_select_own
  ON public.positioning_statements
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY positioning_statements_insert_own
  ON public.positioning_statements
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY positioning_statements_update_own
  ON public.positioning_statements
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY positioning_statements_delete_own
  ON public.positioning_statements
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 3. competitor_analysis_metadata table
-- Stores analysis scores and extracted technical signals
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.competitor_analysis_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  website_score NUMERIC(3,1),  -- 0-100 based on web scrape quality
  has_pricing_page BOOLEAN,
  has_analytics_signals BOOLEAN,
  tech_stack JSONB,  -- Array of detected technologies
  tech_signals JSONB,  -- Array of extracted indicators
  last_analyzed_at TIMESTAMP WITH TIME ZONE,
  analysis_method TEXT,  -- 'web_scrape' | 'ai_inference' | 'manual'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT website_score_range CHECK (
    website_score IS NULL OR (website_score >= 0 AND website_score <= 100)
  )
);

CREATE INDEX idx_analysis_metadata_competitor_id
  ON public.competitor_analysis_metadata(competitor_id);
CREATE INDEX idx_analysis_metadata_analysis_method
  ON public.competitor_analysis_metadata(analysis_method);

-- Add RLS policy for competitor_analysis_metadata
ALTER TABLE public.competitor_analysis_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY analysis_metadata_select_own
  ON public.competitor_analysis_metadata
  FOR SELECT
  USING (
    competitor_id IN (
      SELECT id FROM public.competitors
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY analysis_metadata_insert_own
  ON public.competitor_analysis_metadata
  FOR INSERT
  WITH CHECK (
    competitor_id IN (
      SELECT id FROM public.competitors
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY analysis_metadata_update_own
  ON public.competitor_analysis_metadata
  FOR UPDATE
  USING (
    competitor_id IN (
      SELECT id FROM public.competitors
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    competitor_id IN (
      SELECT id FROM public.competitors
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. View: v_competitor_analysis
-- Joins competitors with their features and analysis metadata
-- ============================================================================

CREATE OR REPLACE VIEW public.v_competitor_analysis AS
SELECT
  c.id,
  c.user_id,
  c.project_id,
  c.name,
  c.website,
  c.category,
  c.threat_level,
  COUNT(cf.id) AS features_count,
  SUM(CASE WHEN cf.has_founder_feature = true THEN 1 ELSE 0 END)::INT AS founder_features_match,
  SUM(CASE WHEN cf.has_founder_feature = false THEN 1 ELSE 0 END)::INT AS founder_features_gap,
  cam.website_score,
  cam.has_pricing_page,
  cam.has_analytics_signals,
  cam.tech_stack,
  cam.tech_signals,
  cam.last_analyzed_at,
  c.created_at,
  c.updated_at
FROM public.competitors c
LEFT JOIN public.competitor_features cf ON c.id = cf.competitor_id
LEFT JOIN public.competitor_analysis_metadata cam ON c.id = cam.competitor_id
GROUP BY
  c.id, c.user_id, c.project_id, c.name, c.website, c.category, c.threat_level,
  cam.id, cam.website_score, cam.has_pricing_page, cam.has_analytics_signals,
  cam.tech_stack, cam.tech_signals, cam.last_analyzed_at, c.created_at, c.updated_at;

-- ============================================================================
-- 5. Helper function: compute_feature_parity_score
-- Returns parity score (0-100) between founder and competitor features
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_feature_parity_score(
  p_competitor_id UUID
)
RETURNS NUMERIC(5,2) AS $$
DECLARE
  v_total_features INT;
  v_matching_features INT;
  v_parity_score NUMERIC(5,2);
BEGIN
  SELECT COUNT(*) INTO v_total_features
  FROM public.competitor_features
  WHERE competitor_id = p_competitor_id;

  IF v_total_features = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_matching_features
  FROM public.competitor_features
  WHERE competitor_id = p_competitor_id
    AND has_founder_feature = true;

  v_parity_score := (v_matching_features::NUMERIC / v_total_features::NUMERIC) * 100;
  RETURN ROUND(v_parity_score, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 6. Helper function: compute_differentiation_score
-- Returns % of founder's features that competitors don't have
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_differentiation_score(
  p_competitor_id UUID
)
RETURNS NUMERIC(5,2) AS $$
DECLARE
  v_total_features INT;
  v_founder_unique INT;
  v_diff_score NUMERIC(5,2);
BEGIN
  SELECT COUNT(*) INTO v_total_features
  FROM public.competitor_features
  WHERE competitor_id = p_competitor_id;

  IF v_total_features = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_founder_unique
  FROM public.competitor_features
  WHERE competitor_id = p_competitor_id
    AND has_founder_feature = true;

  v_diff_score := (v_founder_unique::NUMERIC / v_total_features::NUMERIC) * 100;
  RETURN ROUND(v_diff_score, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 7. Trigger: auto-update updated_at on competitor_features
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_competitor_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_competitor_features_updated_at
  BEFORE UPDATE ON public.competitor_features
  FOR EACH ROW
  EXECUTE FUNCTION public.update_competitor_features_updated_at();

-- ============================================================================
-- 8. Trigger: auto-update updated_at on positioning_statements
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_positioning_statements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_positioning_statements_updated_at
  BEFORE UPDATE ON public.positioning_statements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_positioning_statements_updated_at();

-- ============================================================================
-- 9. Trigger: auto-update updated_at on competitor_analysis_metadata
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_analysis_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_analysis_metadata_updated_at
  BEFORE UPDATE ON public.competitor_analysis_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.update_analysis_metadata_updated_at();

-- ============================================================================
-- 10. Grants and permissions
-- ============================================================================

-- Grant select on view to authenticated users
GRANT SELECT ON public.v_competitor_analysis TO authenticated;

-- Grant execute on helper functions to authenticated users
GRANT EXECUTE ON FUNCTION public.compute_feature_parity_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_differentiation_score(UUID) TO authenticated;

-- ============================================================================
-- End of migration
-- ============================================================================
COMMIT;
