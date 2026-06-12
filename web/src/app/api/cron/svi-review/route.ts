import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendSVIReview, sendMilestoneEmail } from "@/lib/email";
import {
  type SVIAnalysis,
  type SVIEvidenceGap,
  SVI_STAGE_LABELS,
} from "@/lib/svi-analysis";
import { getBadge } from "@/lib/svi-badges";

export const dynamic = "force-dynamic";

// ISO week number (1-53)
function isoWeekNumber(d: Date): number {
  const date = new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  );
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

// Milestone thresholds with badge codes and labels
const SVI_MILESTONES = [
  { threshold: 100, badge: "svi_100", label: "SVI Baseline Achieved!" },
  { threshold: 120, badge: "svi_120", label: "Above Average SVI!" },
  { threshold: 140, badge: "svi_140", label: "Strong SVI Reached!" },
  { threshold: 150, badge: "svi_150", label: "Rising Star!" },
  { threshold: 200, badge: "svi_200", label: "High Performer!" },
  { threshold: 250, badge: "svi_250", label: "Investor Ready!" },
] as const;

interface UserReviewData {
  accountId: string;
  email: string;
  name: string | null;
  currentSvi: number;
  currentStage: number;
  analysis: SVIAnalysis | null;
  previousSvi: number | null;
  consecutiveIncreases: number;
  evidenceCount: number;
  scoreViewCount: number;
  earnedBadges: Set<string>;
}

/**
 * Weekly SVI Review cron.
 *
 * GET /api/cron/svi-review  (Authorization: Bearer CRON_SECRET)
 *
 * For every user with at least one SVI analysis:
 * 1. Sends a personalized review email (wins, gaps, projected score)
 * 2. Checks for milestone crossings and sends celebration emails
 * 3. Tracks all sent notifications to avoid duplicates
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  try {
    const now = new Date();
    const weekNum = isoWeekNumber(now);
    const weekKey = `${now.getUTCFullYear()}_w${weekNum}`;

    // ── 1. Get all users who have at least one SVI analysis ──────────
    const { data: analysisUsers, error: analysisErr } = await supabase
      .from("svi_analyses")
      .select("email")
      .order("created_at", { ascending: false });

    if (analysisErr) throw analysisErr;

    // Deduplicate emails
    const uniqueEmails = [
      ...new Set((analysisUsers ?? []).map((r) => r.email)),
    ];

    if (uniqueEmails.length === 0) {
      return NextResponse.json({
        ok: true,
        reviewed: 0,
        milestones: 0,
        message: "No users with SVI analyses found",
      });
    }

    let reviewed = 0;
    let milestonesSent = 0;
    let skipped = 0;

    for (const email of uniqueEmails) {
      try {
        // ── 2. Load user data ──────────────────────────────────────────

        // Get or create svi_account
        const { data: account } = await supabase
          .from("svi_accounts")
          .select("id, email, name, current_svi, current_stage")
          .eq("email", email)
          .single();

        if (!account) {
          // User has analyses but no account — skip (they may not have enrolled)
          skipped++;
          continue;
        }

        // Check if weekly review already sent for this week
        const reviewType = `weekly_review_${weekKey}`;
        const { data: existingReview } = await supabase
          .from("svi_notifications")
          .select("id")
          .eq("account_id", account.id)
          .eq("notification_type", reviewType)
          .limit(1);

        if (existingReview && existingReview.length > 0) {
          skipped++;
          continue;
        }

        // Load latest analysis
        const { data: latestAnalysis } = await supabase
          .from("svi_analyses")
          .select("total_svi, analysis_json")
          .eq("email", email)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (!latestAnalysis) {
          skipped++;
          continue;
        }

        const analysis =
          (latestAnalysis.analysis_json as SVIAnalysis) ?? null;

        // Load previous week's snapshot for delta
        const { data: snapshots } = await supabase
          .from("svi_snapshots")
          .select("svi_total, delta")
          .eq("account_id", account.id)
          .order("snapshot_date", { ascending: false })
          .limit(4);

        const previousSvi =
          snapshots && snapshots.length > 0
            ? snapshots[0].svi_total
            : null;

        // Count consecutive weeks with positive delta (for streak detection)
        let consecutiveIncreases = 0;
        if (snapshots) {
          for (const snap of snapshots) {
            if (snap.delta != null && snap.delta > 0) {
              consecutiveIncreases++;
            } else {
              break;
            }
          }
        }

        // Evidence count
        const { count: evidenceCount } = await supabase
          .from("svi_evidence")
          .select("id", { count: "exact", head: true })
          .eq("account_id", account.id);

        // Score view count
        const { count: scoreViewCount } = await supabase
          .from("score_views")
          .select("id", { count: "exact", head: true })
          .eq("email", email);

        // Already earned badges
        const { data: earnedBadgeRows } = await supabase
          .from("svi_milestones")
          .select("badge_code")
          .eq("account_id", account.id);

        const earnedBadges = new Set(
          (earnedBadgeRows ?? []).map((r) => r.badge_code),
        );

        const userData: UserReviewData = {
          accountId: account.id,
          email: account.email,
          name: account.name ?? null,
          currentSvi: latestAnalysis.total_svi,
          currentStage: account.current_stage ?? 0,
          analysis,
          previousSvi,
          consecutiveIncreases,
          evidenceCount: evidenceCount ?? 0,
          scoreViewCount: scoreViewCount ?? 0,
          earnedBadges,
        };

        // ── 3. Send review email ─────────────────────────────────────

        await sendReviewEmail(supabase, userData, weekNum, reviewType);
        reviewed++;

        // ── 4. Check and send milestone emails ───────────────────────

        const milestonesAwarded = await checkMilestones(
          supabase,
          userData,
        );
        milestonesSent += milestonesAwarded;
      } catch (userErr) {
        console.error(
          `[blockid:svi-review] Error processing user ${email}:`,
          userErr,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      reviewed,
      milestones: milestonesSent,
      skipped,
      totalUsers: uniqueEmails.length,
      weekKey,
    });
  } catch (err) {
    console.error("[blockid:svi-review] cron failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── Review email assembly ───────────────────────────────────────────────────

async function sendReviewEmail(
  supabase: ReturnType<typeof getSupabaseAdmin> & object,
  user: UserReviewData,
  weekNum: number,
  reviewType: string,
): Promise<void> {
  const analysis = user.analysis;
  const svi = user.currentSvi;
  const stage = user.currentStage;
  const stageLabel =
    SVI_STAGE_LABELS[stage] ?? "Concept";

  // Top 3 wins: highest-scoring sub-dimensions
  const wins: string[] = [];
  if (analysis?.subs) {
    const sorted = [...analysis.subs].sort(
      (a, b) => b.value - a.value,
    );
    for (const sub of sorted.slice(0, 3)) {
      wins.push(sub.label);
    }
  }

  // Top 3 gaps: highest-impact evidence gaps with specific actions
  const gaps: Array<{ label: string; action: string; impact: number }> =
    [];
  if (analysis?.evidenceGaps) {
    const sortedGaps = [...analysis.evidenceGaps].sort(
      (a, b) => b.impact - a.impact,
    );
    for (const gap of sortedGaps.slice(0, 3)) {
      gaps.push({
        label: gap.label,
        action: gap.action,
        impact: gap.impact,
      });
    }
  }

  // Projected SVI if all P0 gaps are filled
  const p0Impact =
    analysis?.evidenceGaps
      ?.filter((g: SVIEvidenceGap) => g.priority === "P0")
      .reduce((sum: number, g: SVIEvidenceGap) => sum + g.impact, 0) ??
    0;
  const projectedSvi = svi + p0Impact;

  const emailResult = await sendSVIReview({
    to: user.email,
    name: user.name,
    svi,
    stage,
    stageLabel,
    wins,
    gaps,
    projectedSvi,
    weekNum,
  });

  // Record notification
  await supabase.from("svi_notifications").insert({
    account_id: user.accountId,
    notification_type: reviewType,
    subject: `Week ${weekNum} SVI Review — Score: ${svi}`,
    payload: {
      svi,
      stage,
      wins,
      gaps,
      projectedSvi,
      emailed: emailResult.ok,
    },
  });
}

// ── Milestone detection + celebration emails ────────────────────────────────

async function checkMilestones(
  supabase: ReturnType<typeof getSupabaseAdmin> & object,
  user: UserReviewData,
): Promise<number> {
  let awarded = 0;

  const maybeAwardMilestone = async (
    badgeCode: string,
    badgeLabel: string,
    message: string,
  ): Promise<boolean> => {
    if (user.earnedBadges.has(badgeCode)) return false;

    // Insert badge into svi_milestones
    const badge = getBadge(badgeCode);
    const { error } = await supabase.from("svi_milestones").insert({
      account_id: user.accountId,
      badge_code: badgeCode,
      badge_label: badge?.label ?? badgeLabel,
    });

    if (error) {
      // Unique constraint violation means already awarded
      if (error.code === "23505") return false;
      console.error(
        `[blockid:svi-review] milestone insert failed for ${badgeCode}:`,
        error,
      );
      return false;
    }

    // Send celebration email
    await sendMilestoneEmail({
      to: user.email,
      name: user.name,
      badge: badgeCode,
      badgeLabel,
      message,
    });

    // Record notification
    await supabase.from("svi_notifications").insert({
      account_id: user.accountId,
      notification_type: `milestone_${badgeCode}`,
      subject: badgeLabel,
      payload: { badge: badgeCode, svi: user.currentSvi },
    });

    user.earnedBadges.add(badgeCode);
    return true;
  };

  // SVI score milestones
  for (const m of SVI_MILESTONES) {
    if (user.currentSvi >= m.threshold) {
      const didAward = await maybeAwardMilestone(
        m.badge,
        m.label,
        `Your SVI crossed ${m.threshold}! This places you among founders who have built real, measurable evidence of startup progress. Keep adding evidence to grow your score.`,
      );
      if (didAward) awarded++;
    }
  }

  // First evidence uploaded
  if (user.evidenceCount > 0) {
    const didAward = await maybeAwardMilestone(
      "evidence_uploaded",
      "First Evidence Uploaded!",
      "You uploaded your first piece of evidence to your BlockID vault. Verified evidence significantly boosts your SVI score and investor confidence.",
    );
    if (didAward) awarded++;
  }

  // First investor view
  if (user.scoreViewCount > 0) {
    const didAward = await maybeAwardMilestone(
      "first_investor_view",
      "First Investor View!",
      "Someone viewed your SVI score share link. Investor interest is a powerful signal — make sure your evidence vault is up to date.",
    );
    if (didAward) awarded++;
  }

  // Week streak: 3+ consecutive weeks with SVI increase
  if (user.consecutiveIncreases >= 3) {
    const streakBadge = `week_streak_${user.consecutiveIncreases}`;
    // Only send for 3, 4, 8, 12 week milestones to avoid spam
    const notableStreaks = [3, 4, 8, 12];
    if (notableStreaks.includes(user.consecutiveIncreases)) {
      const didAward = await maybeAwardMilestone(
        user.consecutiveIncreases >= 4
          ? "weekly_streak_4"
          : streakBadge,
        `${user.consecutiveIncreases}-Week Growth Streak!`,
        `Your SVI has increased for ${user.consecutiveIncreases} consecutive weeks. Consistent progress is the strongest indicator of startup success.`,
      );
      if (didAward) awarded++;
    }
  }

  return awarded;
}

export { GET as POST };
