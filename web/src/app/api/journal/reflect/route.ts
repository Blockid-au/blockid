import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAI } from "@/lib/ai-client";
import { spendCredits, FEATURE_COSTS } from "@/lib/credits";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/journal/reflect — generate AI monthly reflection
// Gathers: journal entries this month, SVI delta, evidence added, actions taken
// Saves as a special journal entry (type: "ai_reflection")
// Costs 0.50 credits
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

  // Optional body: { month?: string } e.g. "2026-05"
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — defaults to current month
  }

  const targetMonth = (body.month as string) || new Date().toISOString().slice(0, 7);
  const monthStart = `${targetMonth}-01`;
  const monthEnd = `${targetMonth}-31`; // Safe — PostgreSQL handles month boundaries

  // Check and spend credits
  const spend = await spendCredits(user.id, "journal_reflect", { month: targetMonth });
  if (!spend.ok) {
    const cost = FEATURE_COSTS.journal_reflect ?? 0.50;
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

  // Gather journal entries for the month
  const { data: entries } = await supabase
    .from("growth_journal")
    .select("entry_type, title, content, tags, svi_at_time, created_at")
    .eq("account_id", user.id)
    .gte("created_at", monthStart)
    .lte("created_at", monthEnd + "T23:59:59Z")
    .neq("entry_type", "ai_reflection")
    .order("created_at", { ascending: true });

  const journalEntries = entries ?? [];

  // Get SVI history for the month (start and end)
  const { data: sviHistory } = await supabase
    .from("svi_snapshots")
    .select("score, snapshot_date")
    .eq("email", user.email)
    .gte("snapshot_date", monthStart)
    .lte("snapshot_date", monthEnd)
    .order("snapshot_date", { ascending: true });

  let sviDelta = "No SVI data available for this month";
  if (sviHistory && sviHistory.length > 0) {
    const startSVI = sviHistory[0].score;
    const endSVI = sviHistory[sviHistory.length - 1].score;
    const delta = endSVI - startSVI;
    sviDelta = `SVI moved from ${startSVI} to ${endSVI} (${delta >= 0 ? "+" : ""}${delta} points)`;
  }

  // Get current SVI for context
  const { data: sviAccount } = await supabase
    .from("svi_accounts")
    .select("current_svi")
    .eq("email", user.email)
    .maybeSingle();

  const currentSVI = sviAccount?.current_svi ?? null;

  // Get evidence count for the month
  const { count: evidenceCount } = await supabase
    .from("evidence_items")
    .select("id", { count: "exact", head: true })
    .eq("email", user.email)
    .gte("created_at", monthStart)
    .lte("created_at", monthEnd + "T23:59:59Z");

  // Get actions completed this month
  const { data: actions } = await supabase
    .from("user_actions")
    .select("action_key, completed_at")
    .eq("email", user.email)
    .not("completed_at", "is", null)
    .gte("completed_at", monthStart)
    .lte("completed_at", monthEnd + "T23:59:59Z");

  const actionsCompleted = actions ?? [];

  // Build context for AI
  const entrySummary = journalEntries.length > 0
    ? journalEntries.map((e) => {
        const d = new Date(e.created_at as string).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
        return `- [${d}] (${e.entry_type}) ${e.title}${e.content ? `: ${(e.content as string).slice(0, 150)}` : ""}`;
      }).join("\n")
    : "No journal entries this month.";

  const actionsSummary = actionsCompleted.length > 0
    ? actionsCompleted.map((a) => `- ${(a.action_key as string).replace(/_/g, " ")}`).join("\n")
    : "No actions completed.";

  const monthName = new Date(monthStart).toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  const prompt = `You are a thoughtful startup advisor writing a monthly reflection for a founder.

Month: ${monthName}
${sviDelta}
Current SVI: ${currentSVI ?? "unknown"}/1000
Evidence documents added: ${evidenceCount ?? 0}
Actions completed: ${actionsCompleted.length}

Journal entries this month:
${entrySummary}

Actions completed:
${actionsSummary}

Write a 3-paragraph monthly reflection:
1. **Progress**: What was accomplished this month. Celebrate wins, note momentum.
2. **Challenges**: What obstacles or friction points emerged. Be honest but supportive.
3. **Next Month Focus**: 2-3 specific, actionable priorities for the coming month based on the patterns you see.

Be specific to the actual entries. If there are few entries, encourage more consistent journaling. Keep the tone warm, direct, and founder-friendly. Use Australian English. Do not use markdown headers — just flowing paragraphs.`;

  try {
    const result = await callAI({
      system: "You are an experienced startup advisor who has mentored hundreds of Australian founders. Write concise, actionable monthly reflections.",
      user: prompt,
      maxTokens: 800,
    });

    // Save as a journal entry
    const { data: entry, error } = await supabase
      .from("growth_journal")
      .insert({
        account_id: user.id,
        email: user.email,
        entry_type: "ai_reflection",
        title: `Monthly Reflection — ${monthName}`,
        content: result.text,
        tags: ["ai", "reflection", targetMonth],
        svi_at_time: currentSVI,
        metadata: {
          month: targetMonth,
          entriesCount: journalEntries.length,
          evidenceCount: evidenceCount ?? 0,
          actionsCompleted: actionsCompleted.length,
          sviDelta,
          provider: result.provider,
          model: result.model,
        },
      })
      .select()
      .single();

    if (error) {
      console.error("[journal/reflect] save error", error);
      return NextResponse.json({ ok: false, error: "Failed to save reflection" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      entry,
      reflection: result.text,
      stats: {
        entriesCount: journalEntries.length,
        evidenceCount: evidenceCount ?? 0,
        actionsCompleted: actionsCompleted.length,
        sviDelta,
      },
    });
  } catch (err) {
    console.error("[journal/reflect] AI error", err);
    return NextResponse.json(
      { ok: false, error: "AI reflection generation failed. Please try again." },
      { status: 500 },
    );
  }
}
