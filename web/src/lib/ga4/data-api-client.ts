// GA4 Data API client — server-only wrapper around googleapis
// (analyticsdata_v1beta). Auth via service-account JSON pulled from
// GOOGLE_APPLICATION_CREDENTIALS_JSON. All Google auth work is deferred
// to request/cron time so importing this module never crashes at build.
//
// CDO plan: docs/plans/mega-2026-07-24/05-cdo-ga4-dashboard.md.
//
// Exports:
//   - isGa4Configured(): boolean
//   - getGa4PropertyId(): string | null
//   - runReport(request): Promise<...>       — thin passthrough
//   - fetchDailySnapshot(): Promise<Ga4SnapshotResult>
//
// fetchDailySnapshot() never throws for missing env; callers get
// { error, hint } so they can render a placeholder tile instead.

import "server-only";

// ── Types ────────────────────────────────────────────────────────────────

export interface Ga4Totals {
  sessions: number;
  activeUsers: number;
  newUsers: number;
  screenPageViews: number;
  conversions: number;
  engagementRate: number;
  averageSessionDuration: number;
}

export interface Ga4TopPage {
  path: string;
  sessions: number;
  views: number;
}

export interface Ga4TopEvent {
  name: string;
  count: number;
}

export interface Ga4SourceMedium {
  source: string;
  medium: string;
  sessions: number;
}

export interface Ga4TrendPoint {
  date: string; // YYYY-MM-DD
  sessions: number;
  users: number;
  conversions: number;
}

export interface Ga4Snapshot {
  captured_at: string;
  date: string; // YYYY-MM-DD (UTC yesterday)
  range_days: number;
  property_id: string;
  totals: Ga4Totals;
  topPages: Ga4TopPage[];
  topEvents: Ga4TopEvent[];
  sourceMedium: Ga4SourceMedium[];
  trend7d: Ga4TrendPoint[];
}

export type Ga4SnapshotResult =
  | { ok: true; snapshot: Ga4Snapshot }
  | { ok: false; error: string; hint?: string };

// ── Env helpers ──────────────────────────────────────────────────────────

export function getGa4PropertyId(): string | null {
  const raw = process.env.GA4_PROPERTY_ID?.trim();
  if (!raw) return null;
  // Accept "123456789" or "properties/123456789"; normalise to the latter.
  return raw.startsWith("properties/") ? raw : `properties/${raw}`;
}

function getServiceAccountJson(): string | null {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  return raw ? raw : null;
}

export function isGa4Configured(): boolean {
  return Boolean(getGa4PropertyId()) && Boolean(getServiceAccountJson());
}

// ── UTC "yesterday" ─────────────────────────────────────────────────────

function utcYesterday(): string {
  const now = new Date();
  const y = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return y.toISOString().slice(0, 10);
}

function utcNDaysAgo(n: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n));
  return d.toISOString().slice(0, 10);
}

// ── Auth (deferred) ──────────────────────────────────────────────────────

async function getAnalyticsData() {
  const credsRaw = getServiceAccountJson();
  if (!credsRaw) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON not set");
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(credsRaw);
  } catch (e) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON");
  }
  // Dynamic import so the module never touches googleapis at import time
  // (keeps dev builds clean when the dep is not needed).
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  return google.analyticsdata({ version: "v1beta", auth });
}

// ── Low-level report passthrough ─────────────────────────────────────────

// Loose shape — googleapis' generated types are heavy; this is a thin
// runtime passthrough so the caller works in either dependency or dev.
export interface Ga4RunReportRequest {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions?: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  orderBys?: Array<{ metric?: { metricName: string }; dimension?: { dimensionName: string }; desc?: boolean }>;
  limit?: number;
}

interface Ga4RunReportRow {
  dimensionValues?: Array<{ value?: string | null }>;
  metricValues?: Array<{ value?: string | null }>;
}

interface Ga4RunReportResponse {
  rows?: Ga4RunReportRow[];
  totals?: Ga4RunReportRow[];
}

export async function runReport(request: Ga4RunReportRequest): Promise<Ga4RunReportResponse> {
  const property = getGa4PropertyId();
  if (!property) throw new Error("GA4_PROPERTY_ID not set");
  const client = await getAnalyticsData();
  const res = await client.properties.runReport({
    property,
    requestBody: request,
  });
  return (res.data ?? {}) as Ga4RunReportResponse;
}

// ── Row helpers ──────────────────────────────────────────────────────────

function num(v: string | null | undefined, fallback = 0): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readMetric(row: Ga4RunReportRow | undefined, idx: number): number {
  return num(row?.metricValues?.[idx]?.value ?? undefined);
}

function readDim(row: Ga4RunReportRow, idx: number): string {
  return row.dimensionValues?.[idx]?.value ?? "";
}

// ── High-level orchestrator ──────────────────────────────────────────────

export async function fetchDailySnapshot(): Promise<Ga4SnapshotResult> {
  if (!isGa4Configured()) {
    return {
      ok: false,
      error: "GA4 API not configured",
      hint: "Set GA4_PROPERTY_ID and GOOGLE_APPLICATION_CREDENTIALS_JSON in .env.local — see docs/plans/mega-2026-07-24/05-cdo-ga4-dashboard.md.",
    };
  }

  const property = getGa4PropertyId()!;
  const date = utcYesterday(); // GA4 date arg
  const start7 = utcNDaysAgo(7);
  const end7 = utcYesterday();

  try {
    // 1) Totals for yesterday
    const totalsRes = await runReport({
      dateRanges: [{ startDate: date, endDate: date }],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "newUsers" },
        { name: "screenPageViews" },
        { name: "conversions" },
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
      ],
    });
    const totalsRow = totalsRes.rows?.[0] ?? totalsRes.totals?.[0];
    const totals: Ga4Totals = {
      sessions: readMetric(totalsRow, 0),
      activeUsers: readMetric(totalsRow, 1),
      newUsers: readMetric(totalsRow, 2),
      screenPageViews: readMetric(totalsRow, 3),
      conversions: readMetric(totalsRow, 4),
      engagementRate: readMetric(totalsRow, 5),
      averageSessionDuration: readMetric(totalsRow, 6),
    };

    // 2) Top pages (path + sessions + views)
    const pagesRes = await runReport({
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }, { name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 5,
    });
    const topPages: Ga4TopPage[] = (pagesRes.rows ?? []).map((r) => ({
      path: readDim(r, 0),
      sessions: readMetric(r, 0),
      views: readMetric(r, 1),
    }));

    // 3) Top events (name + count)
    const eventsRes = await runReport({
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 5,
    });
    const topEvents: Ga4TopEvent[] = (eventsRes.rows ?? []).map((r) => ({
      name: readDim(r, 0),
      count: readMetric(r, 0),
    }));

    // 4) Source / medium
    const srcRes = await runReport({
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 5,
    });
    const sourceMedium: Ga4SourceMedium[] = (srcRes.rows ?? []).map((r) => ({
      source: readDim(r, 0),
      medium: readDim(r, 1),
      sessions: readMetric(r, 0),
    }));

    // 5) 7-day trend by date
    const trendRes = await runReport({
      dateRanges: [{ startDate: start7, endDate: end7 }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "conversions" }],
      orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
      limit: 14,
    });
    const trend7d: Ga4TrendPoint[] = (trendRes.rows ?? []).map((r) => {
      // GA4 returns YYYYMMDD; convert to YYYY-MM-DD.
      const raw = readDim(r, 0);
      const iso = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
      return {
        date: iso,
        sessions: readMetric(r, 0),
        users: readMetric(r, 1),
        conversions: readMetric(r, 2),
      };
    });

    const snapshot: Ga4Snapshot = {
      captured_at: new Date().toISOString(),
      date,
      range_days: 1,
      property_id: property,
      totals,
      topPages,
      topEvents,
      sourceMedium,
      trend7d,
    };
    return { ok: true, snapshot };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg,
      hint: "GA4 Data API call failed — check service-account access on the property and daily-quota headroom.",
    };
  }
}
