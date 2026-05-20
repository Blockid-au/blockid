// Milestone Badge System — server-only.
//
// 15 badge definitions covering analysis, SVI score thresholds, evidence,
// integrations, engagement, and streak milestones. The checkAndAwardBadges
// engine evaluates each condition and inserts newly earned badges into the
// svi_milestones table.

import "server-only";
import { getSupabaseAdmin } from "./supabase";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BadgeContext {
  totalAnalyses: number;
  currentSVI: number;
  evidenceCount: number;
  plan: string;
  hasGithub: boolean;
  hasStripe: boolean;
  hasAnalytics: boolean;
  daysActive: number;
}

export interface BadgeDef {
  code: string;
  label: string;
  description: string;
  icon: string; // emoji or lucide icon name
  condition: (ctx: BadgeContext) => boolean;
}

// ─── Badge definitions ──────────────────────────────────────────────────────

export const BADGE_DEFS: BadgeDef[] = [
  // Analysis
  {
    code: "first_analysis",
    label: "Explorer",
    description: "Completed first SVI analysis",
    icon: "Rocket",
    condition: (ctx) => ctx.totalAnalyses >= 1,
  },

  // SVI score thresholds
  {
    code: "svi_50",
    label: "Warming Up",
    description: "SVI reached 50",
    icon: "Thermometer",
    condition: (ctx) => ctx.currentSVI >= 50,
  },
  {
    code: "svi_100",
    label: "Getting Serious",
    description: "SVI reached 100",
    icon: "Target",
    condition: (ctx) => ctx.currentSVI >= 100,
  },
  {
    code: "svi_120",
    label: "Investor Ready",
    description: "SVI reached 120",
    icon: "Award",
    condition: (ctx) => ctx.currentSVI >= 120,
  },
  {
    code: "svi_150",
    label: "High Performer",
    description: "SVI reached 150",
    icon: "Trophy",
    condition: (ctx) => ctx.currentSVI >= 150,
  },

  // Evidence
  {
    code: "evidence_first",
    label: "Evidence Builder",
    description: "First evidence uploaded",
    icon: "Upload",
    condition: (ctx) => ctx.evidenceCount >= 1,
  },
  {
    code: "evidence_5",
    label: "Data Driven",
    description: "5 evidence items uploaded",
    icon: "BarChart3",
    condition: (ctx) => ctx.evidenceCount >= 5,
  },
  {
    code: "evidence_10",
    label: "Proof Master",
    description: "10 evidence items uploaded",
    icon: "ShieldCheck",
    condition: (ctx) => ctx.evidenceCount >= 10,
  },

  // Connections
  {
    code: "github_connected",
    label: "Code Verified",
    description: "GitHub connected",
    icon: "Github",
    condition: (ctx) => ctx.hasGithub,
  },
  {
    code: "stripe_connected",
    label: "Revenue Verified",
    description: "Stripe connected",
    icon: "CreditCard",
    condition: (ctx) => ctx.hasStripe,
  },
  {
    code: "analytics_connected",
    label: "Growth Tracked",
    description: "Analytics connected",
    icon: "TrendingUp",
    condition: (ctx) => ctx.hasAnalytics,
  },

  // Plan
  {
    code: "paid_plan",
    label: "Committed Founder",
    description: "Upgraded to paid plan",
    icon: "Star",
    condition: (ctx) => ctx.plan !== "free" && ctx.plan !== "",
  },

  // Streaks
  {
    code: "week_streak",
    label: "Consistent",
    description: "Active 7+ days",
    icon: "Flame",
    condition: (ctx) => ctx.daysActive >= 7,
  },
  {
    code: "month_streak",
    label: "Dedicated",
    description: "Active 30+ days",
    icon: "Calendar",
    condition: (ctx) => ctx.daysActive >= 30,
  },

  // Social
  {
    code: "shared_score",
    label: "Networker",
    description: "Shared SVI score with investor",
    icon: "Share2",
    condition: (ctx) => {
      // This badge is awarded externally (e.g. from the share endpoint).
      // The condition always returns false here; it is granted via direct insert.
      void ctx;
      return false;
    },
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getBadgeDef(code: string): BadgeDef | undefined {
  return BADGE_DEFS.find((b) => b.code === code);
}

// ─── Award engine ───────────────────────────────────────────────────────────

/**
 * Checks every badge condition against the provided context and inserts any
 * newly earned badges into svi_milestones. Returns the list of badge codes
 * that were just awarded in this call.
 */
export async function checkAndAwardBadges(
  accountId: string,
  ctx: BadgeContext,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  // Fetch already-earned badges for this account
  const { data: existing } = await supabase
    .from("svi_milestones")
    .select("badge_code")
    .eq("account_id", accountId);

  const earned = new Set((existing ?? []).map((m) => m.badge_code));
  const newBadges: string[] = [];

  for (const badge of BADGE_DEFS) {
    if (earned.has(badge.code)) continue;
    if (!badge.condition(ctx)) continue;

    const { error } = await supabase.from("svi_milestones").insert({
      account_id: accountId,
      badge_code: badge.code,
      badge_label: badge.label,
    });

    if (!error) {
      newBadges.push(badge.code);
      earned.add(badge.code);
    }
  }

  return newBadges;
}
