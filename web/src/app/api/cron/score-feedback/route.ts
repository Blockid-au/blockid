// GET /api/cron/score-feedback — T_FEEDBACK_0001
//
// Scores pending feedback submissions with Claude Haiku and awards credits.
// Processes up to 20 pending submissions per run.
//
// Auth: Bearer CRON_SECRET
// Schedule: hourly (configured in vercel.json / cron runner)

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantCredits } from "@/lib/credits";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/ai-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET;

function authorised(request: Request): boolean {
  if (!CRON_SECRET) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${CRON_SECRET}`;
}

interface AIScore {
  score: number;
  summary: string;
  credits: number;
}

async function scoreWithAI(body: string): Promise<AIScore | null> {
  if (!isAnthropicConfigured()) return null;

  try {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: "You score founder feedback for a startup platform. Return only valid JSON.",
      messages: [
        {
          role: "user",
          content: `Score this feedback 0-100 for quality/actionability. JSON: {"score":number,"summary":string(max 100 chars),"credits":number(5-25)}. Feedback: "${body.replace(/"/g, "'")}"`
        },
      ],
    });

    const text =
      message.content[0]?.type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<AIScore>;
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    const credits = Math.max(5, Math.min(25, Math.round(Number(parsed.credits) || 5)));
    const summary = String(parsed.summary ?? "").slice(0, 100);

    return { score, summary, credits };
  } catch (err) {
    console.error("[score-feedback] AI error", err);
    return null;
  }
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Fetch up to 20 pending submissions
  const { data: pending, error: fetchErr } = await supabase
    .from("feedback_submissions")
    .select("id, user_id, body")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);

  if (fetchErr) {
    console.error("[score-feedback] fetch error", fetchErr);
    return NextResponse.json({ error: "Failed to fetch pending submissions" }, { status: 500 });
  }

  const results = { processed: 0, scored: 0, failed: 0 };

  for (const row of pending ?? []) {
    results.processed++;

    const aiResult = await scoreWithAI(row.body);

    if (!aiResult) {
      // Mark as failed so it doesn't block the queue indefinitely
      await supabase
        .from("feedback_submissions")
        .update({ status: "failed" })
        .eq("id", row.id);
      results.failed++;
      continue;
    }

    // Update the submission with AI results
    const { error: updateErr } = await supabase
      .from("feedback_submissions")
      .update({
        ai_score: aiResult.score,
        ai_summary: aiResult.summary,
        credits_awarded: aiResult.credits,
        status: "scored",
      })
      .eq("id", row.id);

    if (updateErr) {
      console.error("[score-feedback] update error", updateErr);
      results.failed++;
      continue;
    }

    // Grant credits to the user
    await grantCredits(row.user_id, aiResult.credits, "feedback_reward", {
      feedback_id: row.id,
      ai_score: aiResult.score,
    });

    results.scored++;
  }

  return NextResponse.json({ ok: true, ...results });
}
