// Tech Intelligence — database row types for tech_analyses table.
// Hand-authored to match supabase/migrations/20260814_tech_analyses.sql.
// Update when the migration schema changes.

export interface TechAnalysisRow {
  id: string;
  startup_id: string;
  user_id: string;
  tech_score: number;
  svi_contribution: number;
  valuation_multiplier_boost: number;
  website_url: string | null;
  github_url: string | null;
  website_signals: Record<string, unknown> | null;
  github_signals: Record<string, unknown> | null;
  llm_assessment: Record<string, unknown> | null;
  tech_maturity: number | null;
  product_presence: number | null;
  developer_activity: number | null;
  scalability_score: number | null;
  analysis_version: string;
  created_at: string;
}

export interface TechAnalysisInsert {
  id?: string;
  startup_id: string;
  user_id: string;
  tech_score: number;
  svi_contribution?: number;
  valuation_multiplier_boost?: number;
  website_url?: string | null;
  github_url?: string | null;
  website_signals?: Record<string, unknown> | null;
  github_signals?: Record<string, unknown> | null;
  llm_assessment?: Record<string, unknown> | null;
  tech_maturity?: number | null;
  product_presence?: number | null;
  developer_activity?: number | null;
  scalability_score?: number | null;
  analysis_version?: string;
  created_at?: string;
}

export type TechAnalysisUpdate = Partial<TechAnalysisInsert>;
