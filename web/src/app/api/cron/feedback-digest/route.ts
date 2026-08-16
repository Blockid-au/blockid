// GET /api/cron/feedback-digest — T_FEEDBACK_0001
//
// Weekly Telegram digest of feedback submissions:
// count, avg AI score, total credits awarded in the last 7 days.
//
// Auth: Bearer CRON_SECRET
// Schedule: weekly (e.g. Mondays 08:00 UTC)

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTelegram, mdEscape } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET;

function authorised(request: Request): boolean {
  if (!CRON_SECRET) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch last 7 days of scored submissions
  const { data: rows, error } = await supabase
    .from("feedback_submissions")
    .select("ai_score, credits_awarded, category, rating")
    .eq("status", "scored")
    .gte("created_at", sevenDaysAgo);

  if (error) {
    console.error("[feedback-digest] fetch error", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }

  // Fetch total submissions (including pending/failed) for the window
  const { count: totalSubmissions } = await supabase
    .from("feedback_submissions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo);

  const scored = rows ?? [];
  const count = scored.length;
  const avgScore =
    count > 0
      ? Math.round(
          scored.reduce((sum, r) => sum + (r.ai_score ?? 0), 0) / count,
        )
      : 0;
  const totalCredits = scored.reduce(
    (sum, r) => sum + (r.credits_awarded ?? 0),
    0,
  );
  const avgRating =
    count > 0
      ? (
          scored.reduce((sum, r) => sum + (r.rating ?? 0), 0) / count
        ).toFixed(1)
      : "N/A";

  // Category breakdown
  const byCat: Record<string, number> = {};
  for (const r of scored) {
    byCat[r.category] = (byCat[r.category] ?? 0) + 1;
  }
  const catLines = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `  • ${mdEscape(cat)}: ${n}`)
    .join("\n");

  const today = new Date().toISOString().slice(0, 10);
  const message =
    `📣 *BlockID Feedback Digest* — 7 days to ${mdEscape(today)}\n\n` +
    `📊 *Submissions:* ${totalSubmissions ?? 0} total, ${count} scored\n` +
    `⭐ *Avg Rating:* ${avgRating}/5\n` +
    `🎯 *Avg AI Score:* ${avgScore}/100\n` +
    `💰 *Credits Awarded:* ${totalCredits}\n` +
    (catLines ? `\n*By Category:*\n${catLines}` : "");

  const sent = await sendTelegram(message);

  return NextResponse.json({
    ok: true,
    sent,
    stats: {
      totalSubmissions: totalSubmissions ?? 0,
      scored: count,
      avgScore,
      avgRating,
      totalCredits,
      byCat,
    },
  });
}
