-- Knowledge Base — proprietary self-growing repository of valuation methodologies,
-- SVI scoring frameworks, financial models, and startup intelligence. Every
-- C-Level AI agent reads from and writes to this KB to ground their analysis
-- in BlockID's accumulated wisdom rather than generic LLM knowledge.
--
-- Powers BlockID's #1 competitive moat: better analysis than any competitor
-- relying on generic AI.

-- KB articles/entries (long-form knowledge)
CREATE TABLE IF NOT EXISTS kb_articles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text        UNIQUE NOT NULL,
  title       text        NOT NULL,
  category    text        NOT NULL CHECK (category IN (
                            'valuation','svi','equity','market',
                            'financial','legal','strategy','benchmark'
                          )),
  content     text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  author      text        NOT NULL DEFAULT 'system',
  version     integer     NOT NULL DEFAULT 1,
  is_public   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- KB methodology templates (reusable formulas/processes across startups)
CREATE TABLE IF NOT EXISTS kb_methodologies (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        UNIQUE NOT NULL,
  type          text        NOT NULL CHECK (type IN (
                              'valuation_method','svi_dimension','equity_model',
                              'financial_template','process'
                            )),
  description   text        NOT NULL,
  inputs        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  formula       text,
  formula_code  text,
  examples      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  refs          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_by    text        NOT NULL DEFAULT 'cfo',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- KB research notes (C-Level agents log discoveries here as they work)
CREATE TABLE IF NOT EXISTS kb_research_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent       text        NOT NULL,
  topic       text        NOT NULL,
  findings    text        NOT NULL,
  confidence  real        CHECK (confidence BETWEEN 0 AND 1),
  applied_to  text,
  source_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- KB snapshot/export audit log
CREATE TABLE IF NOT EXISTS kb_exports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  exported_by   text        NOT NULL,
  export_type   text        NOT NULL CHECK (export_type IN ('full','category','methodology')),
  file_path     text,
  article_count integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_articles_category   ON kb_articles(category);
CREATE INDEX IF NOT EXISTS idx_kb_articles_slug       ON kb_articles(slug);
CREATE INDEX IF NOT EXISTS idx_kb_articles_updated    ON kb_articles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_methodologies_type  ON kb_methodologies(type);
CREATE INDEX IF NOT EXISTS idx_kb_research_notes_agent ON kb_research_notes(agent);
CREATE INDEX IF NOT EXISTS idx_kb_research_notes_created ON kb_research_notes(created_at DESC);

-- Enable RLS — service role bypasses, authenticated users get public-only read,
-- writes are service-role only (only C-Level agents using SUPABASE_SERVICE_ROLE_KEY
-- can write to the KB; admin UI calls via service-role API routes).
ALTER TABLE kb_articles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_methodologies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_research_notes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_exports         ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_articles_service_all ON kb_articles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY kb_articles_public_select ON kb_articles
  FOR SELECT TO authenticated
  USING (is_public = true);

CREATE POLICY kb_methodologies_service_all ON kb_methodologies
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY kb_methodologies_select ON kb_methodologies
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY kb_research_notes_service_all ON kb_research_notes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY kb_exports_service_all ON kb_exports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
