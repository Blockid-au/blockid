// POST /api/feedback — Submit feedback, AI evaluates, reward credits if useful
// GET /api/feedback — List user's feedback history

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantCredits } from "@/lib/credits";
import { callAI } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Login required to submit feedback" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });

  let body: { feedback: string; category?: string; page?: string } = { feedback: "" };
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const { feedback, category, page } = body;
  if (!feedback || feedback.trim().length < 10) {
    return NextResponse.json({ ok: false, error: "Feedback must be at least 10 characters" }, { status: 400 });
  }
  if (feedback.length > 2000) {
    return NextResponse.json({ ok: false, error: "Feedback must be under 2000 characters" }, { status: 400 });
  }

  // Rate limit: max 5 feedback per user per day
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("user_feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", oneDayAgo);

  if ((count ?? 0) >= 5) {
    return NextResponse.json({ ok: false, error: "Maximum 5 feedback submissions per day" }, { status: 429 });
  }

  // AI evaluation: is this feedback useful, specific, and actionable?
  let aiScore = 0;
  let aiSummary = "";
  let creditsAwarded = 0;

  try {
    const aiResult = await callAI({
      system: "You are the R&D Agent for BlockID.au (a startup platform). Evaluate user feedback. Respond in JSON only.",
      user: `Evaluate this feedback:

Feedback: "${feedback.slice(0, 500)}"
Category: ${category || "general"}
Page: ${page || "unknown"}

Rate on 3 criteria (0-10 each):
1. SPECIFICITY: concrete issue or improvement?
2. ACTIONABILITY: can dev team act on it?
3. VALUE: would it improve UX for other founders?

JSON response: {"specificity": N, "actionability": N, "value": N, "summary": "1-sentence R&D summary", "is_useful": true/false, "suggested_credits": 0.25|0.50|1.00}
Rules: 0.25=minor, 0.50=good, 1.00=excellent. is_useful=true if total>=15/30.`,
      maxTokens: 200,
    });
    const aiResponse = aiResult.text;

    try {
      const parsed = JSON.parse(aiResponse.replace(/```json\n?|```/g, "").trim());
      aiScore = (parsed.specificity ?? 0) + (parsed.actionability ?? 0) + (parsed.value ?? 0);
      aiSummary = parsed.summary ?? "";
      if (parsed.is_useful && aiScore >= 15) {
        creditsAwarded = Math.min(parsed.suggested_credits ?? 0.25, 1.00);
      }
    } catch {
      // AI response wasn't valid JSON — give minimum credit for effort
      aiSummary = "Feedback received (AI evaluation unavailable)";
      creditsAwarded = 0.25;
      aiScore = 15;
    }
  } catch {
    // AI unavailable — still save feedback, give minimum credit
    aiSummary = "Feedback received (AI evaluation pending)";
    creditsAwarded = 0.25;
    aiScore = 15;
  }

  // Save feedback
  const { error: insertErr } = await supabase.from("user_feedback").insert({
    user_id: user.id,
    email: user.email,
    feedback: feedback.trim(),
    category: category || "general",
    page: page || null,
    ai_score: aiScore,
    ai_summary: aiSummary,
    credits_awarded: creditsAwarded,
    status: creditsAwarded > 0 ? "rewarded" : "received",
  });

  if (insertErr) {
    console.error("[feedback] insert error", insertErr);
    return NextResponse.json({ ok: false, error: "Failed to save feedback" }, { status: 500 });
  }

  // Award credits if useful
  if (creditsAwarded > 0) {
    await grantCredits(user.id, creditsAwarded, "feedback_reward").catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    creditsAwarded,
    aiSummary,
    message: creditsAwarded > 0
      ? `Thank you! Your feedback earned ${creditsAwarded} credit${creditsAwarded !== 1 ? "s" : ""}. Keep sharing — every insight helps us build a better platform for founders.`
      : "Thank you for your feedback! We've recorded it for our team to review.",
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Auth required" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });

  const { data } = await supabase
    .from("user_feedback")
    .select("id, feedback, category, ai_summary, credits_awarded, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ ok: true, feedback: data ?? [] });
}
