// SVI Milestone Badge System — server-only.
//
// Badge definitions, lookup helpers, and the award engine that checks conditions
// and inserts into the svi_milestones table when a new badge is earned.

import "server-only";
import { getSupabaseAdmin } from "./supabase";

// ─── Badge definitions ───────────────────────────────────────────────────────

export interface BadgeDef {
  code: string;
  label: string;
  description: string;
  icon: string; // Lucide icon name
  category: "analysis" | "evidence" | "score" | "growth" | "connection";
}

export const BADGES: BadgeDef[] = [
  // Analysis badges
  { code: "first_analysis", label: "First Steps", description: "Completed your first SVI analysis", icon: "Rocket", category: "analysis" },
  { code: "deep_diver", label: "Deep Diver", description: "Completed a Deep Dive report", icon: "Search", category: "analysis" },

  // Evidence badges
  { code: "evidence_uploaded", label: "Evidence Builder", description: "Uploaded your first evidence", icon: "Upload", category: "evidence" },
  { code: "pitch_deck", label: "Pitch Ready", description: "Uploaded a pitch deck", icon: "FileText", category: "evidence" },
  { code: "five_evidence", label: "Well Documented", description: "Uploaded 5 pieces of evidence", icon: "FolderOpen", category: "evidence" },

  // Score badges
  { code: "svi_100", label: "Baseline", description: "Reached SVI score of 100", icon: "Target", category: "score" },
  { code: "svi_150", label: "Rising Star", description: "Reached SVI score of 150", icon: "Star", category: "score" },
  { code: "svi_200", label: "High Performer", description: "Reached SVI score of 200", icon: "Trophy", category: "score" },
  { code: "svi_250", label: "Investor Ready", description: "Reached SVI score of 250", icon: "Award", category: "score" },

  // Growth badges
  { code: "stage_advance", label: "Level Up", description: "Advanced to the next startup stage", icon: "TrendingUp", category: "growth" },
  { code: "weekly_streak_4", label: "Consistent", description: "Active 4 weeks in a row", icon: "Flame", category: "growth" },
  { code: "score_improved", label: "Growth Mindset", description: "Improved SVI score from previous week", icon: "ArrowUp", category: "growth" },

  // Connection badges
  { code: "github_connected", label: "Code Verified", description: "Connected GitHub repository", icon: "Github", category: "connection" },
  { code: "analytics_connected", label: "Data Driven", description: "Connected Google Analytics", icon: "BarChart3", category: "connection" },
  { code: "stripe_connected", label: "Revenue Proven", description: "Connected Stripe for revenue verification", icon: "CreditCard", category: "connection" },
];

export function getBadge(code: string): BadgeDef | undefined {
  return BADGES.find((b) => b.code === code);
}

// ─── Badge award engine ──────────────────────────────────────────────────────

export interface BadgeCheckContext {
  accountId: string;
  currentSVI: number;
  previousSVI?: number;
  currentStage: number;
  previousStage?: number;
  evidenceCount: number;
  analysisCount: number;
  hasDeepDive: boolean;
  connectedSources: string[]; // ["github", "analytics", "stripe"]
  weeklyStreak: number;
  evidenceTypes: string[]; // ["document", "url", "github", etc.]
}

export async function checkAndAwardBadges(
  ctx: BadgeCheckContext,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  // Get already earned badges
  const { data: existing } = await supabase
    .from("svi_milestones")
    .select("badge_code")
    .eq("account_id", ctx.accountId);

  const earned = new Set(existing?.map((m) => m.badge_code) ?? []);
  const newBadges: string[] = [];

  const maybeAward = async (code: string) => {
    if (earned.has(code)) return;
    const badge = getBadge(code);
    if (!badge) return;

    const { error } = await supabase
      .from("svi_milestones")
      .insert({
        account_id: ctx.accountId,
        badge_code: code,
        badge_label: badge.label,
      });

    if (!error) {
      newBadges.push(code);
      earned.add(code);
    }
  };

  // Check each badge condition
  if (ctx.analysisCount >= 1) await maybeAward("first_analysis");
  if (ctx.hasDeepDive) await maybeAward("deep_diver");
  if (ctx.evidenceCount >= 1) await maybeAward("evidence_uploaded");
  if (ctx.evidenceCount >= 5) await maybeAward("five_evidence");
  if (
    ctx.evidenceTypes.includes("pitch_deck") ||
    ctx.evidenceTypes.some((t) => t.includes("pitch"))
  )
    await maybeAward("pitch_deck");
  if (ctx.currentSVI >= 100) await maybeAward("svi_100");
  if (ctx.currentSVI >= 150) await maybeAward("svi_150");
  if (ctx.currentSVI >= 200) await maybeAward("svi_200");
  if (ctx.currentSVI >= 250) await maybeAward("svi_250");
  if (
    ctx.previousStage !== undefined &&
    ctx.currentStage > ctx.previousStage
  )
    await maybeAward("stage_advance");
  if (
    ctx.previousSVI !== undefined &&
    ctx.currentSVI > ctx.previousSVI
  )
    await maybeAward("score_improved");
  if (ctx.weeklyStreak >= 4) await maybeAward("weekly_streak_4");
  if (ctx.connectedSources.includes("github"))
    await maybeAward("github_connected");
  if (ctx.connectedSources.includes("analytics"))
    await maybeAward("analytics_connected");
  if (ctx.connectedSources.includes("stripe"))
    await maybeAward("stripe_connected");

  return newBadges;
}
