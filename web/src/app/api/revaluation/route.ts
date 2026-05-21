import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAI } from "@/lib/ai-client";
import { spendCredits, FEATURE_COSTS } from "@/lib/credits";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/revaluation — generate quarterly revaluation report
// Uses current SVI, metrics, evidence, and cap table data
// Compares with previous quarter
// Saves as journal entry (type: "revaluation")
// Costs 1.00 credit
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  // Optional body: { quarter?: string } e.g. "2026-Q2"
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body — defaults to current quarter
  }

  const now = new Date();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
  const quarterLabel = (body.quarter as string) || `${now.getFullYear()}-Q${currentQuarter}`;

  // Determine quarter date range
  const year = parseInt(quarterLabel.split("-")[0]);
  const q = parseInt(quarterLabel.split("Q")[1]);
  const qStartMonth = (q - 1) * 3; // 0-indexed
  const qStart = new Date(year, qStartMonth, 1).toISOString().slice(0, 10);
  const qEnd = new Date(year, qStartMonth + 3, 0).toISOString().slice(0, 10); // last day of quarter

  // Check and spend credits
  const spend = await spendCredits(user.id, "quarterly_revaluation", { quarter: quarterLabel });
  if (!spend.ok) {
    const cost = FEATURE_COSTS.quarterly_revaluation ?? 1.00;
    return NextResponse.json(
      {
        ok: false,
        error: "Insufficient credits",
        creditsRequired: cost,
        balance: spend.balance,
      },
      { status: 402 },
    );
  }

  // Gather data for revaluation
  const [
    sviAccountRes,
    sviHistoryRes,
    metricsRes,
    evidenceCountRes,
    journalRes,
    capTableRes,
    prevRevalRes,
  ] = await Promise.all([
    // Current SVI
    supabase
      .from("svi_accounts")
      .select("current_svi, startup_name, industry")
      .eq("email", user.email)
      .maybeSingle(),
    // SVI snapshots for the quarter
    supabase
      .from("svi_snapshots")
      .select("score, snapshot_date")
      .eq("email", user.email)
      .gte("snapshot_date", qStart)
      .lte("snapshot_date", qEnd)
      .order("snapshot_date", { ascending: true }),
    // Latest metrics
    supabase
      .from("startup_metrics")
      .select("*")
      .eq("email", user.email)
      .order("metric_date", { ascending: false })
      .limit(2),
    // Evidence count for period
    supabase
      .from("evidence_items")
      .select("id", { count: "exact", head: true })
      .eq("email", user.email)
      .gte("created_at", qStart)
      .lte("created_at", qEnd + "T23:59:59Z"),
    // Journal entries for the quarter
    supabase
      .from("growth_journal")
      .select("entry_type, title")
      .eq("account_id", user.id)
      .gte("created_at", qStart)
      .lte("created_at", qEnd + "T23:59:59Z")
      .neq("entry_type", "revaluation"),
    // Cap table (shareholder count)
    supabase
      .from("shareholders")
      .select("name, shares_held, role")
      .eq("account_id", user.id),
    // Previous revaluation
    supabase
      .from("growth_journal")
      .select("content, metadata, created_at")
      .eq("account_id", user.id)
      .eq("entry_type", "revaluation")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const sviAccount = sviAccountRes.data;
  const currentSVI = sviAccount?.current_svi ?? null;
  const startupName = sviAccount?.startup_name ?? "Your startup";
  const industry = sviAccount?.industry ?? "Technology";

  // SVI delta
  const sviHistory = sviHistoryRes.data ?? [];
  let sviStart = currentSVI;
  let sviEnd = currentSVI;
  if (sviHistory.length > 0) {
    sviStart = sviHistory[0].score;
    sviEnd = sviHistory[sviHistory.length - 1].score;
  }

  // Metrics
  const metrics = metricsRes.data ?? [];
  const latestMetric = metrics[0] ?? null;
  const previousMetric = metrics[1] ?? null;

  const arr = latestMetric ? (Number(latestMetric.arr_aud) || (Number(latestMetric.mrr_aud) || 0) * 12) : 0;
  const prevArr = previousMetric ? (Number(previousMetric.arr_aud) || (Number(previousMetric.mrr_aud) || 0) * 12) : 0;

  const evidenceCount = evidenceCountRes.count ?? 0;
  const journalEntries = journalRes.data ?? [];
  const shareholders = capTableRes.data ?? [];
  const prevRevaluation = prevRevalRes.data;

  // Build estimated valuation range using SVI and revenue multiples
  const sviMultiplier = currentSVI ? currentSVI / 1000 : 0.3; // 0 to 1 scale
  const baseMultiple = arr > 0 ? Math.max(2, Math.min(30, sviMultiplier * 25)) : 0;
  const lowValuation = arr > 0 ? arr * Math.max(1, baseMultiple * 0.6) : sviMultiplier * 500000;
  const midValuation = arr > 0 ? arr * baseMultiple : sviMultiplier * 1000000;
  const highValuation = arr > 0 ? arr * baseMultiple * 1.5 : sviMultiplier * 2000000;

  // Journal summary
  const entryCounts: Record<string, number> = {};
  for (const e of journalEntries) {
    entryCounts[e.entry_type as string] = (entryCounts[e.entry_type as string] || 0) + 1;
  }

  const prompt = `You are an Australian startup valuation analyst writing a quarterly revaluation report.

Startup: ${startupName}
Industry: ${industry}
Quarter: ${quarterLabel}
Current SVI Score: ${currentSVI ?? "N/A"}/1000
SVI Change: ${sviStart} -> ${sviEnd} (${(sviEnd ?? 0) - (sviStart ?? 0)} points)

Financial Metrics:
- Annual Recurring Revenue (ARR): $${arr.toLocaleString()} AUD
- Previous Period ARR: $${prevArr.toLocaleString()} AUD
- Revenue Growth: ${prevArr > 0 ? ((arr - prevArr) / prevArr * 100).toFixed(1) + "%" : "N/A"}

Activity:
- Evidence documents added: ${evidenceCount}
- Journal entries: ${journalEntries.length} (${Object.entries(entryCounts).map(([k, v]) => `${v} ${k}`).join(", ") || "none"})
- Shareholders: ${shareholders.length}

Estimated Valuation Range:
- Conservative: $${Math.round(lowValuation).toLocaleString()} AUD
- Mid: $${Math.round(midValuation).toLocaleString()} AUD
- Optimistic: $${Math.round(highValuation).toLocaleString()} AUD
- Revenue multiple used: ${baseMultiple.toFixed(1)}x ARR

${prevRevaluation ? `Previous revaluation notes: ${(prevRevaluation.content as string)?.slice(0, 300)}...` : "No previous revaluation on record."}

Write a quarterly revaluation report with these sections:
1. **Valuation Summary** — State the estimated valuation range and the methodology used (SVI score + revenue multiples + comparable Australian startups).
2. **Key Drivers** — What moved the valuation up or down this quarter? Reference specific SVI changes, revenue, and evidence.
3. **Risk Factors** — 2-3 risks that could affect valuation. Be specific, not generic.
4. **Quarter Ahead Outlook** — What should the founder focus on to increase valuation next quarter?
5. **Recommendation** — One clear recommendation (e.g., "Focus on unit economics before raising", "Ready for pre-seed conversations").

Use Australian English. Be data-driven and reference the actual numbers. Keep each section to 2-4 sentences. Format with **bold** section headers.`;

  try {
    const result = await callAI({
      system: "You are a CFA-qualified startup valuation analyst specialising in Australian early-stage companies. You use SVI (Startup Viability Index), revenue multiples, and comparable exits to estimate pre-revenue and early-revenue startup valuations.",
      user: prompt,
      maxTokens: 1200,
    });

    // Save as a journal entry
    const { data: entry, error } = await supabase
      .from("growth_journal")
      .insert({
        account_id: user.id,
        email: user.email,
        entry_type: "revaluation",
        title: `Quarterly Revaluation — ${quarterLabel}`,
        content: result.text,
        tags: ["revaluation", quarterLabel, "ai"],
        svi_at_time: currentSVI,
        metadata: {
          quarter: quarterLabel,
          sviStart,
          sviEnd,
          arr,
          prevArr,
          lowValuation: Math.round(lowValuation),
          midValuation: Math.round(midValuation),
          highValuation: Math.round(highValuation),
          revenueMultiple: Math.round(baseMultiple * 10) / 10,
          evidenceCount,
          journalEntries: journalEntries.length,
          shareholderCount: shareholders.length,
          provider: result.provider,
          model: result.model,
        },
      })
      .select()
      .single();

    if (error) {
      console.error("[revaluation] save error", error);
      return NextResponse.json({ ok: false, error: "Failed to save revaluation" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      entry,
      valuation: {
        low: Math.round(lowValuation),
        mid: Math.round(midValuation),
        high: Math.round(highValuation),
        revenueMultiple: Math.round(baseMultiple * 10) / 10,
        arr,
        svi: currentSVI,
      },
    });
  } catch (err) {
    console.error("[revaluation] AI error", err);
    return NextResponse.json(
      { ok: false, error: "Revaluation generation failed. Please try again." },
      { status: 500 },
    );
  }
}
