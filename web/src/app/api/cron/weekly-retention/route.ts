// /api/cron/weekly-retention — T-0418.
//
// Weekly retention snapshot per audience segment. For each segment we
// compute:
//   - active subscribers (subscription_trial_state joined app_users.segment)
//   - trial-to-paid conversion (subs whose trial_end fell in the last 14d)
//   - 30-day churn (churn_events joined app_users.segment)
//   - trailing 30-day net revenue (revenue_events joined app_users.segment)
// and write one markdown file per segment into content/reports/. The output
// paths and a light summary are returned as JSON.
//
// Auth: x-cron-secret or Authorization Bearer. Schedule: Mondays 09:15 UTC.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  formatSegmentReport,
  type SegmentMetrics,
} from "@/lib/retention/segment-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

const SEGMENTS = [
  "founder",
  "investor_angel",
  "investor_vc",
  "advisor",
  "accelerator",
  "lp",
  "admin",
] as const;

type Segment = (typeof SEGMENTS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface SegmentSummary {
  segment: Segment;
  active_subs: number;
  trial_conversion_pct: number;
  churn_30d: number;
  net_revenue_aud_cents_30d: number;
  report_path: string;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "supabase_not_configured" },
      { status: 503 },
    );
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "supabase_unavailable" },
      { status: 503 },
    );
  }

  const now = new Date();
  const nowMs = now.getTime();
  const fourteenDaysAgoIso = new Date(nowMs - 14 * DAY_MS).toISOString();
  const thirtyDaysAgoIso = new Date(nowMs - 30 * DAY_MS).toISOString();
  const asOfDate = now.toISOString().slice(0, 10);
  const asOfHuman = now.toISOString();

  // ----------------------------------------------------------------------
  // Bulk fetch: pull the raw rows once and bucket in memory. This keeps the
  // Supabase round-trips constant regardless of segment count.
  // ----------------------------------------------------------------------
  const emptyBucket = (): { active: number; trialEnded: number; trialConverted: number; churn: number; revenue: number } => ({
    active: 0,
    trialEnded: 0,
    trialConverted: 0,
    churn: 0,
    revenue: 0,
  });
  const buckets: Record<Segment, ReturnType<typeof emptyBucket>> = Object.fromEntries(
    SEGMENTS.map((seg) => [seg, emptyBucket()]),
  ) as Record<Segment, ReturnType<typeof emptyBucket>>;

  const usersRes = await supabase
    .from("app_users")
    .select("id, segment");
  if (usersRes.error) {
    return NextResponse.json(
      { error: `app_users query failed: ${usersRes.error.message}` },
      { status: 500 },
    );
  }
  const segmentByUser = new Map<string, Segment>();
  for (const row of (usersRes.data ?? []) as { id: string | null; segment: string | null }[]) {
    if (!row.id) continue;
    const seg = (row.segment ?? "") as Segment;
    if (SEGMENTS.includes(seg)) {
      segmentByUser.set(row.id, seg);
    }
  }

  // Active subscribers.
  const activeRes = await supabase
    .from("subscription_trial_state")
    .select("user_id, status")
    .eq("status", "active");
  if (!activeRes.error) {
    for (const row of (activeRes.data ?? []) as { user_id: string | null }[]) {
      if (!row.user_id) continue;
      const seg = segmentByUser.get(row.user_id);
      if (seg) buckets[seg].active += 1;
    }
  }

  // Trial funnel: rows whose trial_end fell in the last 14 days. Converted
  // = same window AND status='active'.
  const trialRes = await supabase
    .from("subscription_trial_state")
    .select("user_id, status, trial_end")
    .gte("trial_end", fourteenDaysAgoIso);
  if (!trialRes.error) {
    for (const row of (trialRes.data ?? []) as { user_id: string | null; status: string | null }[]) {
      if (!row.user_id) continue;
      const seg = segmentByUser.get(row.user_id);
      if (!seg) continue;
      buckets[seg].trialEnded += 1;
      if (row.status === "active") buckets[seg].trialConverted += 1;
    }
  }

  // Churn (30d).
  const churnRes = await supabase
    .from("churn_events")
    .select("user_id, ts")
    .gte("ts", thirtyDaysAgoIso);
  if (!churnRes.error) {
    for (const row of (churnRes.data ?? []) as { user_id: string | null }[]) {
      if (!row.user_id) continue;
      const seg = segmentByUser.get(row.user_id);
      if (seg) buckets[seg].churn += 1;
    }
  }

  // Net revenue (30d). subscribe/renewal/upgrade only.
  const revenueRes = await supabase
    .from("revenue_events")
    .select("user_id, net_aud_cents, kind, ts")
    .in("kind", ["subscribe", "renewal", "upgrade"])
    .gte("ts", thirtyDaysAgoIso);
  if (!revenueRes.error) {
    for (const row of (revenueRes.data ?? []) as {
      user_id: string | null;
      net_aud_cents: number | null;
    }[]) {
      if (!row.user_id) continue;
      const seg = segmentByUser.get(row.user_id);
      if (!seg) continue;
      buckets[seg].revenue += Number(row.net_aud_cents ?? 0);
    }
  }

  // ----------------------------------------------------------------------
  // Render + write one file per segment.
  // ----------------------------------------------------------------------
  const reportDir = path.join(process.cwd(), "content", "reports");
  try {
    await fs.mkdir(reportDir, { recursive: true });
  } catch (err) {
    console.error("[cron:weekly-retention] mkdir failed", err);
  }

  const summaries: SegmentSummary[] = [];
  const reports: string[] = [];

  for (const segment of SEGMENTS) {
    const bucket = buckets[segment];
    const conversion = bucket.trialEnded > 0 ? bucket.trialConverted / bucket.trialEnded : 0;
    const metrics: SegmentMetrics = {
      activeSubs: bucket.active,
      trialConversion: conversion,
      churn30d: bucket.churn,
      netRevenueAud: bucket.revenue / 100,
      asOf: asOfHuman,
    };
    const md = formatSegmentReport(segment, metrics);
    const filename = `retention-${segment}-${asOfDate}.md`;
    const outPath = path.join(reportDir, filename);
    try {
      await fs.writeFile(outPath, md, "utf8");
      reports.push(outPath);
    } catch (err) {
      console.error(`[cron:weekly-retention] write ${outPath} failed`, err);
    }
    summaries.push({
      segment,
      active_subs: bucket.active,
      trial_conversion_pct: Math.round(conversion * 1000) / 10,
      churn_30d: bucket.churn,
      net_revenue_aud_cents_30d: bucket.revenue,
      report_path: outPath,
    });
  }

  return NextResponse.json({
    ok: true,
    generated_at: asOfHuman,
    segments: summaries,
    reports,
  });
}
