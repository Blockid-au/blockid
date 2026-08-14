// GET /api/admin/ga4-report — admin-gated GA4 traffic report.
//
// Returns top 10 pages by pageviews for the last 30 days, plus sessions
// and bounce rate per page. Uses the server-only GA4 Data API client at
// web/src/lib/ga4/data-api-client.ts. Degrades gracefully when GA4 is not
// configured — returns empty rows with `connected: false`.
//
// Auth: admin only (email === ADMIN_EMAIL or role === "admin").
// Cache: no-store (real-time data).

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";
import { isGa4Configured, runReport } from "@/lib/ga4/data-api-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface Ga4ReportRow {
  page: string;
  pageviews: number;
  sessions: number;
  bounceRate: number;
  avgSessionDurationSec: number;
}

export interface Ga4ReportResponse {
  ok: true;
  connected: boolean;
  rangeLabel: string;
  rows: Ga4ReportRow[];
  generatedAt: string;
}

function utcNDaysAgo(n: number): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n),
  );
  return d.toISOString().slice(0, 10);
}

function num(v: string | null | undefined, fallback = 0): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET() {
  // Auth guard
  const user = await getCurrentUser();
  const isAdmin =
    !!user && (user.email === ADMIN_EMAIL || user.role === "admin");
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const connected = isGa4Configured();

  if (!connected) {
    const response: Ga4ReportResponse = {
      ok: true,
      connected: false,
      rangeLabel: "Last 30 days",
      rows: [],
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);
  }

  try {
    const startDate = utcNDaysAgo(30);
    const endDate = utcNDaysAgo(0);

    const result = await runReport({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "sessions" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
      ],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    });

    const rows: Ga4ReportRow[] = (result.rows ?? []).map((r) => ({
      page: r.dimensionValues?.[0]?.value ?? "(unknown)",
      pageviews: num(r.metricValues?.[0]?.value),
      sessions: num(r.metricValues?.[1]?.value),
      bounceRate: num(r.metricValues?.[2]?.value),
      avgSessionDurationSec: num(r.metricValues?.[3]?.value),
    }));

    const response: Ga4ReportResponse = {
      ok: true,
      connected: true,
      rangeLabel: "Last 30 days",
      rows,
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Graceful degradation: still return 200 with empty data so the UI
    // can render a "data unavailable" state rather than crashing.
    const response: Ga4ReportResponse = {
      ok: true,
      connected: false,
      rangeLabel: "Last 30 days",
      rows: [],
      generatedAt: new Date().toISOString(),
    };
    console.error("[ga4-report] GA4 API error:", msg);
    return NextResponse.json(response);
  }
}
