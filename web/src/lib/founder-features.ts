// Shared server helpers for the Phase-1 founder core features
// (GTM strategy, competitor review, team members, pricing tiers,
// roadmap milestones). All rows are scoped to (user_id, project_id) so
// multi-startup founders never see cross-startup data.
//
// Every helper returns a plain array/object and swallows Supabase errors
// after logging — the callers render a graceful empty state instead of
// crashing when the migration has not been applied yet.

import type { AppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";

const LOG = "[blockid:founder-features]";

export interface GtmStrategy {
  id: string;
  user_id: string;
  project_id: string;
  target_segment: string | null;
  problem_statement: string | null;
  value_prop: string | null;
  positioning: string | null;
  primary_channel: string | null;
  secondary_channels: string[] | null;
  sales_motion: string | null;
  price_anchor: string | null;
  launch_plan: string | null;
  north_star_metric: string | null;
  north_star_target: number | null;
  created_at: string;
  updated_at: string;
}

export interface Competitor {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  website: string | null;
  category: string | null;
  positioning: string | null;
  pricing: string | null;
  strengths: string | null;
  weaknesses: string | null;
  our_edge: string | null;
  threat_level: "low" | "medium" | "high" | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  user_id: string;
  project_id: string;
  role_title: string;
  role_category: string | null;
  full_name: string | null;
  equity_pct: number | null;
  salary_aud: number | null;
  start_date: string | null;
  status: "filled" | "open" | "planned";
  reports_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PricingTier {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  model: "freemium" | "flat" | "per_seat" | "usage" | "tiered" | "enterprise";
  price_monthly_aud: number | null;
  price_annual_aud: number | null;
  billing_note: string | null;
  features: string[];
  target_segment: string | null;
  cta_label: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RoadmapMilestone {
  id: string;
  user_id: string;
  project_id: string;
  quarter: string;
  title: string;
  description: string | null;
  category: string | null;
  status: "planned" | "in_progress" | "shipped" | "cancelled";
  target_date: string | null;
  owner: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Return the active project_id for the current request, or null. */
export async function getActiveProjectIdOrNull(): Promise<string | null> {
  return getProjectIdFromRequest();
}

/** Fetch the single GTM strategy for (user, project). Returns null if none. */
export async function getGtmStrategy(
  user: AppUser,
  projectId: string | null,
): Promise<GtmStrategy | null> {
  const sb = getSupabaseAdmin();
  if (!sb || !projectId) return null;
  const { data, error } = await sb
    .from("gtm_strategies")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    console.error(`${LOG} getGtmStrategy failed`, error.message);
    return null;
  }
  return (data as GtmStrategy) ?? null;
}

export async function listCompetitors(
  user: AppUser,
  projectId: string | null,
): Promise<Competitor[]> {
  const sb = getSupabaseAdmin();
  if (!sb || !projectId) return [];
  const { data, error } = await sb
    .from("competitors")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(`${LOG} listCompetitors failed`, error.message);
    return [];
  }
  return (data as Competitor[]) ?? [];
}

export async function listTeamMembers(
  user: AppUser,
  projectId: string | null,
): Promise<TeamMember[]> {
  const sb = getSupabaseAdmin();
  if (!sb || !projectId) return [];
  const { data, error } = await sb
    .from("team_members")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(`${LOG} listTeamMembers failed`, error.message);
    return [];
  }
  return (data as TeamMember[]) ?? [];
}

export async function listPricingTiers(
  user: AppUser,
  projectId: string | null,
): Promise<PricingTier[]> {
  const sb = getSupabaseAdmin();
  if (!sb || !projectId) return [];
  const { data, error } = await sb
    .from("pricing_tiers")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error(`${LOG} listPricingTiers failed`, error.message);
    return [];
  }
  return (data as PricingTier[]) ?? [];
}

export async function listRoadmapMilestones(
  user: AppUser,
  projectId: string | null,
): Promise<RoadmapMilestone[]> {
  const sb = getSupabaseAdmin();
  if (!sb || !projectId) return [];
  const { data, error } = await sb
    .from("roadmap_milestones")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("quarter", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    console.error(`${LOG} listRoadmapMilestones failed`, error.message);
    return [];
  }
  return (data as RoadmapMilestone[]) ?? [];
}

// ─── Quarter helpers ────────────────────────────────────────────────────────
// Format: "YYYY-Qn". Simple, sortable, and matches how VCs write dates.

export function currentQuarterKey(now: Date = new Date()): string {
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
}

export function nextQuarters(count: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  let year = from.getFullYear();
  let quarter = Math.floor(from.getMonth() / 3) + 1;
  for (let i = 0; i < count; i += 1) {
    out.push(`${year}-Q${quarter}`);
    quarter += 1;
    if (quarter > 4) {
      quarter = 1;
      year += 1;
    }
  }
  return out;
}
