import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAI } from "@/lib/ai-client";
import { sendGrowthReport } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Daily cron: compute funnel metrics from Supabase and generate AI growth
 * recommendations. Store in `growth_insights` table.
 *
 * Trigger: GET /api/cron/growth-insights  (Authorization: Bearer CRON_SECRET)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    // ── Gather metrics from Supabase ────────────────────────────────────

    const [
      totalUsersRes,
      newUsersRes,
      weekUsersRes,
      analysesRes,
      weekAnalysesRes,
      leadsRes,
      weekLeadsRes,
      accountsRes,
      evidenceRes,
      scoresRes,
      planDistRes,
      recentAnalysesRes,
      weeklySnapshotsRes,
      actionsRes,
    ] = await Promise.all([
      // Total users
      supabase.from("app_users").select("id", { count: "exact", head: true }),
      // New users today
      supabase.from("app_users").select("id", { count: "exact", head: true })
        .gte("created_at", `${today}T00:00:00Z`),
      // New users this week
      supabase.from("app_users").select("id", { count: "exact", head: true })
        .gte("created_at", `${weekAgo}T00:00:00Z`),
      // SVI analyses today
      supabase.from("svi_analyses").select("id", { count: "exact", head: true })
        .gte("created_at", `${today}T00:00:00Z`),
      // SVI analyses this week
      supabase.from("svi_analyses").select("id", { count: "exact", head: true })
        .gte("created_at", `${weekAgo}T00:00:00Z`),
      // Leads today
      supabase.from("leads").select("id", { count: "exact", head: true })
        .gte("created_at", `${today}T00:00:00Z`),
      // Leads this week
      supabase.from("leads").select("id", { count: "exact", head: true })
        .gte("created_at", `${weekAgo}T00:00:00Z`),
      // SVI accounts (total)
      supabase.from("svi_accounts").select("id", { count: "exact", head: true }),
      // Evidence items this week
      supabase.from("svi_evidence").select("id", { count: "exact", head: true })
        .gte("created_at", `${weekAgo}T00:00:00Z`),
      // Score views this week
      supabase.from("score_views").select("id", { count: "exact", head: true })
        .gte("viewed_at", `${weekAgo}T00:00:00Z`),
      // Plan distribution
      supabase.from("svi_accounts").select("plan"),
      // Recent analyses with scores (for average)
      supabase.from("svi_analyses").select("total_svi, email, created_at")
        .gte("created_at", `${weekAgo}T00:00:00Z`)
        .order("created_at", { ascending: false })
        .limit(100),
      // Weekly snapshots for trend
      supabase.from("svi_snapshots").select("svi_total, delta, snapshot_date")
        .gte("snapshot_date", weekAgo)
        .order("snapshot_date", { ascending: false })
        .limit(200),
      // User actions this week
      supabase.from("user_actions").select("action_type, action_label, tool_slug")
        .gte("created_at", `${weekAgo}T00:00:00Z`),
    ]);

    // ── Compute metrics ────────────────────────────────────────────────

    const totalUsers = totalUsersRes.count ?? 0;
    const newUsersToday = newUsersRes.count ?? 0;
    const newUsersWeek = weekUsersRes.count ?? 0;
    const sviToday = analysesRes.count ?? 0;
    const sviWeek = weekAnalysesRes.count ?? 0;
    const leadsToday = leadsRes.count ?? 0;
    const leadsWeek = weekLeadsRes.count ?? 0;
    const totalAccounts = accountsRes.count ?? 0;
    const evidenceWeek = evidenceRes.count ?? 0;
    const scoresViewedWeek = scoresRes.count ?? 0;

    // Plan distribution
    const planDist: Record<string, number> = {};
    for (const row of planDistRes.data ?? []) {
      const p = (row as { plan: string }).plan ?? "free";
      planDist[p] = (planDist[p] ?? 0) + 1;
    }
    const payingUsers = Object.entries(planDist)
      .filter(([k]) => k !== "free")
      .reduce((sum, [, v]) => sum + v, 0);

    // Average SVI score
    const recentScores = (recentAnalysesRes.data ?? []) as Array<{ total_svi: number }>;
    const avgSVI = recentScores.length > 0
      ? Math.round(recentScores.reduce((s, r) => s + r.total_svi, 0) / recentScores.length)
      : 0;

    // SVI trend (average delta this week)
    const snapshots = (weeklySnapshotsRes.data ?? []) as Array<{ delta: number | null }>;
    const deltas = snapshots.filter((s) => s.delta !== null).map((s) => s.delta!);
    const avgDelta = deltas.length > 0
      ? Math.round(deltas.reduce((s, d) => s + d, 0) / deltas.length * 10) / 10
      : 0;

    // Tool usage breakdown
    const actions = (actionsRes.data ?? []) as Array<{ action_type: string; tool_slug: string | null }>;
    const toolUsage: Record<string, number> = {};
    for (const a of actions) {
      const key = a.tool_slug ?? a.action_type;
      toolUsage[key] = (toolUsage[key] ?? 0) + 1;
    }

    // Unique emails from analyses (proxy for "engaged users")
    const uniqueEmails = new Set(
      ((recentAnalysesRes.data ?? []) as Array<{ email: string }>).map((r) => r.email),
    ).size;

    // Conversion rates
    const sviStartRate = totalUsers > 0 ? Math.round((sviWeek / Math.max(totalUsers, 1)) * 10000) / 100 : 0;
    const signupRate = sviWeek > 0 ? Math.round((newUsersWeek / Math.max(sviWeek, 1)) * 10000) / 100 : 0;
    const paymentRate = totalAccounts > 0 ? Math.round((payingUsers / Math.max(totalAccounts, 1)) * 10000) / 100 : 0;

    // Funnel: SVI → Signup → Paid (find biggest drop-off)
    const funnel = [
      { step: "SVI Analysis", count: sviWeek },
      { step: "Account Signup", count: newUsersWeek },
      { step: "Paid Plan", count: payingUsers },
    ];
    let biggestDropOff = "";
    let dropOffRate = 0;
    for (let i = 1; i < funnel.length; i++) {
      const prev = funnel[i - 1].count;
      const curr = funnel[i].count;
      if (prev > 0) {
        const drop = Math.round(((prev - curr) / prev) * 10000) / 100;
        if (drop > dropOffRate) {
          dropOffRate = drop;
          biggestDropOff = `${funnel[i - 1].step} → ${funnel[i].step}`;
        }
      }
    }

    // ── AI Recommendations ──────────────────────────────────────────────

    const metricsContext = `
BlockID.au Growth Metrics (${today}):
- Total registered users: ${totalUsers}
- New users this week: ${newUsersWeek} (today: ${newUsersToday})
- SVI analyses this week: ${sviWeek} (today: ${sviToday})
- Unique engaged users (analyzed this week): ${uniqueEmails}
- Leads captured this week: ${leadsWeek} (today: ${leadsToday})
- Total SVI accounts: ${totalAccounts}
- Paying users: ${payingUsers}
- Plan distribution: ${JSON.stringify(planDist)}
- Evidence uploaded this week: ${evidenceWeek}
- Score views this week: ${scoresViewedWeek}
- Average SVI score: ${avgSVI}/200
- Average SVI weekly delta: ${avgDelta > 0 ? "+" : ""}${avgDelta}
- Tool usage this week: ${JSON.stringify(toolUsage)}
- Conversion: SVI→Signup ${signupRate}%, Accounts→Paid ${paymentRate}%
- Biggest funnel drop-off: ${biggestDropOff} (${dropOffRate}%)

Platform context:
- Free: SVI analysis + shareable link
- Founding 50: AUD $49 one-time (lifetime SVI account + tools)
- SVI Report: AUD $25 one-off AI report
- Founder plan: $99/mo, Growth plan: $499/mo
- Free tools: Idea Valuation, Equity Split, Funding Plan, Dilution Calculator, Cap Table, Term Sheet AI, Data Room Checklist, Co-founder Match
- Target market: Australian startup founders (pre-seed to Series A)
`;

    let recommendations: Array<{
      priority: "critical" | "high" | "medium";
      title: string;
      detail: string;
      impact: string;
      action_type: "pricing" | "ux" | "marketing" | "product" | "retention";
    }> = [];

    try {
      const aiResult = await callAI({
        system: `You are a growth advisor for BlockID.au, an Australian startup platform. Analyze the metrics and return ONLY a JSON array of 3-5 actionable recommendations. Each recommendation must have:
- priority: "critical" | "high" | "medium"
- title: short action title (max 60 chars)
- detail: specific, actionable explanation (2-3 sentences, reference specific numbers)
- impact: expected outcome (e.g. "+20% conversion", "AUD $500/week")
- action_type: "pricing" | "ux" | "marketing" | "product" | "retention"

Focus on the FASTEST path to revenue. Be specific with numbers. If data is zero/low, recommend activation strategies. Return valid JSON only, no markdown.`,
        user: metricsContext,
        maxTokens: 1500,
      });

      const parsed = JSON.parse(aiResult.text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
      if (Array.isArray(parsed)) recommendations = parsed;
    } catch (aiErr) {
      console.error("[growth-insights] AI recommendation failed:", aiErr);
      // Fallback: rule-based recommendations
      recommendations = generateFallbackRecommendations({
        totalUsers, newUsersWeek, sviWeek, payingUsers, signupRate, paymentRate,
        biggestDropOff, dropOffRate, evidenceWeek, leadsWeek,
      });
    }

    // ── Persist ────────────────────────────────────────────────────────

    const { error: upsertError } = await supabase.from("growth_insights").upsert({
      insight_date: today,
      visitors_total: totalUsers,
      svi_started: sviWeek,
      svi_completed: sviWeek,
      signups: newUsersWeek,
      leads_captured: leadsWeek,
      checkouts_started: 0, // Will be populated from GA4 later
      checkouts_completed: payingUsers,
      evidence_uploaded: evidenceWeek,
      scores_shared: scoresViewedWeek,
      revenue_aud: 0, // Will be populated from Stripe later
      paying_users: payingUsers,
      svi_start_rate: sviStartRate,
      svi_complete_rate: sviWeek > 0 ? 100 : 0,
      signup_rate: signupRate,
      checkout_rate: 0,
      payment_rate: paymentRate,
      recommendations: JSON.stringify(recommendations),
      plan_distribution: JSON.stringify(planDist),
      biggest_drop_off: biggestDropOff || null,
      drop_off_rate: dropOffRate,
    }, { onConflict: "insight_date" });

    if (upsertError) throw upsertError;

    // ── Send growth report email ────────────────────────────────────────

    try {
      await sendGrowthReport({
        to: "admin@blockid.au",
        date: today,
        metrics: {
          totalUsers, newUsersWeek, newUsersToday,
          sviWeek, sviToday, leadsWeek, leadsToday,
          totalAccounts, payingUsers, evidenceWeek,
          scoresViewedWeek, avgSVI, avgDelta, uniqueEmails,
          signupRate, paymentRate, planDist, toolUsage,
          biggestDropOff, dropOffRate,
        },
        recommendations,
      });
    } catch (emailErr) {
      console.error("[growth-insights] growth report email failed:", emailErr);
    }

    // ── Also fetch yesterday's for comparison ───────────────────────────

    const { data: yesterdayData } = await supabase
      .from("growth_insights")
      .select("*")
      .eq("insight_date", yesterday)
      .single();

    return NextResponse.json({
      ok: true,
      date: today,
      metrics: {
        totalUsers, newUsersWeek, newUsersToday,
        sviWeek, sviToday, leadsWeek, leadsToday,
        totalAccounts, payingUsers, evidenceWeek,
        scoresViewedWeek, avgSVI, avgDelta, uniqueEmails,
        signupRate, paymentRate, planDist, toolUsage,
        biggestDropOff, dropOffRate,
      },
      recommendations,
      yesterday: yesterdayData ?? null,
    });
  } catch (err) {
    console.error("[blockid:growth-insights] cron failed", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

// ── Fallback rule-based recommendations ───────────────────────────────────

function generateFallbackRecommendations(m: {
  totalUsers: number;
  newUsersWeek: number;
  sviWeek: number;
  payingUsers: number;
  signupRate: number;
  paymentRate: number;
  biggestDropOff: string;
  dropOffRate: number;
  evidenceWeek: number;
  leadsWeek: number;
}) {
  const recs: Array<{
    priority: "critical" | "high" | "medium";
    title: string;
    detail: string;
    impact: string;
    action_type: "pricing" | "ux" | "marketing" | "product" | "retention";
  }> = [];

  if (m.totalUsers < 10) {
    recs.push({
      priority: "critical",
      title: "Drive initial traffic to SVI tool",
      detail: `Only ${m.totalUsers} total users. Share SVI tool on LinkedIn, Startup Daily, and Australian founder communities. The free SVI analysis is your best acquisition hook.`,
      impact: "Target 50+ SVI analyses in first week",
      action_type: "marketing",
    });
  }

  if (m.sviWeek > 5 && m.signupRate < 20) {
    recs.push({
      priority: "high",
      title: "Add email capture before SVI results",
      detail: `${m.sviWeek} analyses this week but only ${m.signupRate}% signup rate. Gate the full 10-page report behind email — show page 1 (score) free, require email for pages 2-10.`,
      impact: "+30-50% email capture rate",
      action_type: "ux",
    });
  }

  if (m.payingUsers === 0 && m.totalUsers > 0) {
    recs.push({
      priority: "critical",
      title: "Launch time-limited Founding 50 push",
      detail: `${m.totalUsers} users but $0 revenue. Send personal email to every SVI user offering Founding 50 ($49) with urgency: "Only X spots left." Include their SVI score in the email.`,
      impact: "AUD $245-490 from first 5-10 conversions",
      action_type: "pricing",
    });
  }

  if (m.evidenceWeek === 0 && m.totalUsers > 5) {
    recs.push({
      priority: "medium",
      title: "Guide users to upload evidence",
      detail: `No evidence uploads this week. Add a post-SVI prompt: "Upload your pitch deck to boost your score by +10 points." Evidence vault drives engagement and retention.`,
      impact: "+15% user activation, higher SVI scores",
      action_type: "product",
    });
  }

  if (m.dropOffRate > 60 && m.biggestDropOff) {
    recs.push({
      priority: "high",
      title: `Fix drop-off: ${m.biggestDropOff}`,
      detail: `${m.dropOffRate}% drop-off at ${m.biggestDropOff}. This is your biggest leak. Simplify the flow, reduce friction, add social proof at this step.`,
      impact: `Even 10% improvement = ${Math.round(m.sviWeek * 0.1)} more conversions/week`,
      action_type: "ux",
    });
  }

  if (m.leadsWeek > 0 && m.payingUsers === 0) {
    recs.push({
      priority: "high",
      title: "Email nurture sequence for leads",
      detail: `${m.leadsWeek} leads captured but no conversions. Set up a 3-email drip: Day 1: SVI score reminder, Day 3: "Top founders do X", Day 7: Founding 50 offer with deadline.`,
      impact: "5-10% lead-to-paid conversion",
      action_type: "marketing",
    });
  }

  return recs.slice(0, 5);
}

export { GET as POST };
