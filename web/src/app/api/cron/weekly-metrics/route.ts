// /api/cron/weekly-metrics — weekly pricing/growth aggregates.
//
// W7b: rolls up the last 7d of trial and revenue activity plus 30d MRR/ARR
// and per-segment churn, appends a snapshot line to
// web/content/reports/pricing-metrics-YYYY-WW.jsonl and pings Telegram.
//
// Auth: x-cron-secret or Authorization Bearer. Schedule: Mondays 08:00 UTC.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface Snapshot {
  generated_at: string;
  window: { start_iso: string; end_iso: string };
  trial_starts_7d: number;
  trial_conversions_7d: number;
  trial_conversion_rate_pct: number;
  mrr_aud_cents_30d: number;
  arr_aud_cents_30d: number;
  churn_by_segment: Record<string, number>;
  total_churn_7d: number;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 503 });
  }

  const now = new Date();
  const nowMs = now.getTime();
  const sevenDaysAgoIso = new Date(nowMs - 7 * 86_400_000).toISOString();
  const thirtyDaysAgoIso = new Date(nowMs - 30 * 86_400_000).toISOString();

  // -------------------------------------------------------------------------
  // Trial funnel (7d)
  // -------------------------------------------------------------------------
  const [{ count: trialStarts }, { count: trialConversions }] = await Promise.all([
    supabase
      .from("subscription_trial_state")
      .select("user_id", { count: "exact", head: true })
      .gte("trial_start", sevenDaysAgoIso),
    supabase
      .from("subscription_trial_state")
      .select("user_id", { count: "exact", head: true })
      .eq("status", "active")
      .gte("trial_start", sevenDaysAgoIso)
      .not("stripe_subscription_id", "is", null),
  ]);

  // -------------------------------------------------------------------------
  // MRR / ARR (30d)
  // -------------------------------------------------------------------------
  const { data: revenueRows } = await supabase
    .from("revenue_events")
    .select("net_aud_cents, kind, ts")
    .in("kind", ["subscribe", "renewal"])
    .gte("ts", thirtyDaysAgoIso);

  const mrrCents = (revenueRows ?? []).reduce(
    (sum: number, r: { net_aud_cents: number | null }) =>
      sum + Number(r.net_aud_cents ?? 0),
    0,
  );
  const arrCents = mrrCents * 12;

  // -------------------------------------------------------------------------
  // Churn by segment (7d)
  // -------------------------------------------------------------------------
  const { data: churnRows } = await supabase
    .from("churn_events")
    .select("user_id")
    .gte("ts", sevenDaysAgoIso);

  const churnByUser = (churnRows ?? []).map((r: { user_id: string | null }) => r.user_id).filter(
    (id): id is string => Boolean(id),
  );

  let churnBySegment: Record<string, number> = {};
  if (churnByUser.length > 0) {
    const { data: segmentRows } = await supabase
      .from("app_users")
      .select("id, segment")
      .in("id", churnByUser);
    for (const row of (segmentRows ?? []) as { segment: string | null }[]) {
      const seg = row.segment ?? "unknown";
      churnBySegment[seg] = (churnBySegment[seg] ?? 0) + 1;
    }
  }

  const totalChurn = churnByUser.length;
  const trialStartsN = trialStarts ?? 0;
  const trialConversionsN = trialConversions ?? 0;
  const conversionPct =
    trialStartsN > 0 ? (trialConversionsN / trialStartsN) * 100 : 0;

  const snapshot: Snapshot = {
    generated_at: now.toISOString(),
    window: { start_iso: sevenDaysAgoIso, end_iso: now.toISOString() },
    trial_starts_7d: trialStartsN,
    trial_conversions_7d: trialConversionsN,
    trial_conversion_rate_pct: Math.round(conversionPct * 10) / 10,
    mrr_aud_cents_30d: mrrCents,
    arr_aud_cents_30d: arrCents,
    churn_by_segment: churnBySegment,
    total_churn_7d: totalChurn,
  };

  // -------------------------------------------------------------------------
  // Append to jsonl
  // -------------------------------------------------------------------------
  const { year, week } = isoWeek(now);
  const filename = `pricing-metrics-${year}-${String(week).padStart(2, "0")}.jsonl`;
  const reportPath = path.join(
    process.cwd(),
    "content",
    "reports",
    filename,
  );

  try {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.appendFile(reportPath, JSON.stringify(snapshot) + "\n", "utf8");
  } catch (err) {
    console.error("[cron:weekly-metrics] append failed", err);
  }

  // -------------------------------------------------------------------------
  // Telegram summary
  // -------------------------------------------------------------------------
  const audFmt = (cents: number) =>
    `A$${(cents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
  const summary =
    `📊 Weekly metrics ${year}-W${week}\n` +
    `Trials: ${trialStartsN} started · ${trialConversionsN} converted (${snapshot.trial_conversion_rate_pct}%)\n` +
    `MRR (30d): ${audFmt(mrrCents)} · ARR: ${audFmt(arrCents)}\n` +
    `Churn (7d): ${totalChurn} across ${Object.keys(churnBySegment).length} segments`;
  sendTelegram(summary).catch(() => {});

  return NextResponse.json({ ok: true, snapshot, report_path: reportPath });
}

// isoWeek — ISO-8601 week number so filenames sort correctly year-on-year.
function isoWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}
