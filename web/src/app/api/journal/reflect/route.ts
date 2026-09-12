import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAI } from "@/lib/ai-client";
import { spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/journal/reflect — generate AI monthly reflection
// Gathers: journal entries this month, SVI delta, evidence added, actions taken
// Saves as a special journal entry (type: "ai_reflection")
// Costs 0.50 credits
// ---------------------------------------------------------------------------

async function POST_handler(request: Request) {
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

  // S18-A — editor+ (an AI reflection entry is written to the journal).
  // Journal + SVI context are the project OWNER's (user id / email); the
  // credits are the CALLER's.
  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  const projectId = scope?.projectId ?? null;
  const ownerUserId = scope?.ownerUserId ?? user.id;
  const dataEmail = scope?.dataEmail ?? user.email;

  // Check and spend credits
  const spend = await spendCredits(user.id, "journal_reflect", {
    month: targetMonth,
    project_id: projectId,
  });
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
    .eq("account_id", ownerUserId)
    .gte("created_at", monthStart)
    .lte("created_at", monthEnd + "T23:59:59Z")
    .neq("entry_type", "ai_reflection")
    .order("created_at", { ascending: true });

  const journalEntries = entries ?? [];

  // Get the project's SVI account first — S18-A review P2-1: every SVI-side
  // read below is bounded by its id. An email alone spans every project the
  // owner has, so a member on project A would otherwise read B's snapshots,
  // evidence and actions. (`svi_snapshots` / `evidence_items` have no
  // `email` column at all — they are keyed on `account_id`; `user_actions`
  // carries both, so it is filtered on both.)
  const sviAccountQuery = supabase
    .from("svi_accounts")
    .select("id, current_svi")
    .eq("email", dataEmail);
  if (projectId) sviAccountQuery.eq("project_id", projectId);
  else sviAccountQuery.is("project_id", null);
  const { data: sviAccount } = await sviAccountQuery.maybeSingle();

  const currentSVI = sviAccount?.current_svi ?? null;
  const sviAccountId = typeof sviAccount?.id === "string" ? sviAccount.id : null;

  // Get SVI history for the month (start and end) — this project's account only
  let sviHistory: Array<{ svi_total: number; snapshot_date: string }> | null = null;
  if (sviAccountId) {
    const { data } = await supabase
      .from("svi_snapshots")
      .select("svi_total, snapshot_date")
      .eq("account_id", sviAccountId)
      .gte("snapshot_date", monthStart)
      .lte("snapshot_date", monthEnd)
      .order("snapshot_date", { ascending: true });
    sviHistory = data;
  }

  let sviDelta = "No SVI data available for this month";
  if (sviHistory && sviHistory.length > 0) {
    const startSVI = sviHistory[0].svi_total;
    const endSVI = sviHistory[sviHistory.length - 1].svi_total;
    const delta = endSVI - startSVI;
    sviDelta = `SVI moved from ${startSVI} to ${endSVI} (${delta >= 0 ? "+" : ""}${delta} points)`;
  }

  // Get evidence count for the month — this project's account only
  let evidenceCount: number | null = 0;
  if (sviAccountId) {
    const { count } = await supabase
      .from("evidence_items")
      .select("id", { count: "exact", head: true })
      .eq("account_id", sviAccountId)
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd + "T23:59:59Z");
    evidenceCount = count;
  }

  // Get actions completed this month — this project's account only
  let actions: Array<Record<string, unknown>> | null = null;
  if (sviAccountId) {
    const { data } = await supabase
      .from("user_actions")
      .select("action_key, completed_at")
      .eq("email", dataEmail)
      .eq("account_id", sviAccountId)
      .not("completed_at", "is", null)
      .gte("completed_at", monthStart)
      .lte("completed_at", monthEnd + "T23:59:59Z");
    actions = data;
  }

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
        account_id: ownerUserId,
        email: dataEmail,
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

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/journal/reflect/route.ts", method: "POST" }, POST_handler);
