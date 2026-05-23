import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findOrCreateSVIAccount, getProjectIdFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";


// ---------------------------------------------------------------------------
// Metric field whitelist — only these columns can be written
// ---------------------------------------------------------------------------

const NUMERIC_FIELDS = [
  "mrr_aud",
  "arr_aud",
  "revenue_growth_pct",
  "mau",
  "dau",
  "monthly_churn_pct",
  "nrr_pct",
  "cac_aud",
  "ltv_aud",
  "burn_rate_aud",
  "runway_months",
  "users_total",
  "users_new",
  "nps",
  "revenue",
] as const;

// Text fields that accept string values
const TEXT_FIELDS = ["notes"] as const;

const METRIC_FIELDS = [...NUMERIC_FIELDS, ...TEXT_FIELDS] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];
type TextField = (typeof TEXT_FIELDS)[number];

function isNumericField(key: string): key is NumericField {
  return (NUMERIC_FIELDS as readonly string[]).includes(key);
}

function isTextField(key: string): key is TextField {
  return (TEXT_FIELDS as readonly string[]).includes(key);
}

// ---------------------------------------------------------------------------
// POST /api/metrics — Save/update metrics for a given date
// Body: { date?, source?, metrics: { mrr_aud?: number, arr_aud?: number, ... } }
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Service unavailable" },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      date?: string;
      source?: string;
      metrics?: Record<string, number | string | null>;
    };

    // Validate date
    const metricDate =
      body.date ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(metricDate)) {
      return NextResponse.json(
        { ok: false, error: "date must be in YYYY-MM-DD format" },
        { status: 400 },
      );
    }

    // Validate source
    const validSources = ["manual", "stripe", "analytics", "github"];
    const source = body.source ?? "manual";
    if (!validSources.includes(source)) {
      return NextResponse.json(
        { ok: false, error: `Invalid source. Must be one of: ${validSources.join(", ")}` },
        { status: 400 },
      );
    }

    // Validate metrics object
    if (!body.metrics || typeof body.metrics !== "object") {
      return NextResponse.json(
        { ok: false, error: "metrics object is required" },
        { status: 400 },
      );
    }

    // Filter to only valid metric fields
    const metricData: Record<string, number | string | null> = {};
    for (const [key, val] of Object.entries(body.metrics)) {
      if (isNumericField(key)) {
        if (val !== null && (typeof val !== "number" || !isFinite(val))) {
          return NextResponse.json(
            { ok: false, error: `${key} must be a finite number or null` },
            { status: 400 },
          );
        }
        metricData[key] = val;
      } else if (isTextField(key)) {
        if (val !== null && typeof val !== "string") {
          return NextResponse.json(
            { ok: false, error: `${key} must be a string or null` },
            { status: 400 },
          );
        }
        metricData[key] = val;
      }
    }

    if (Object.keys(metricData).length === 0) {
      return NextResponse.json(
        { ok: false, error: `No valid metric fields provided. Valid fields: ${METRIC_FIELDS.join(", ")}` },
        { status: 400 },
      );
    }

    const projectId = await getProjectIdFromRequest();
    const accountId = await findOrCreateSVIAccount(user.email, projectId);
    if (!accountId) {
      return NextResponse.json(
        { ok: false, error: "Failed to resolve account" },
        { status: 500 },
      );
    }

    // Upsert: one row per account + date
    const { data: row, error } = await supabase
      .from("startup_metrics")
      .upsert(
        {
          account_id: accountId,
          email: user.email,
          metric_date: metricDate,
          source,
          updated_at: new Date().toISOString(),
          ...metricData,
        },
        { onConflict: "account_id,metric_date" },
      )
      .select()
      .single();

    if (error) {
      console.error("[blockid:metrics] upsert failed", error);
      return NextResponse.json(
        { ok: false, error: "Failed to save metrics" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, metrics: row });
  } catch (err) {
    console.error("[blockid:metrics] POST error", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/metrics?period=12m
// Returns metrics history for the logged-in user (last N months)
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Service unavailable" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? "12m";

    // Parse period into a date cutoff
    const periodMonths = parseInt(period.replace("m", ""), 10);
    const cutoffDate = new Date();
    cutoffDate.setMonth(
      cutoffDate.getMonth() - (isNaN(periodMonths) ? 12 : periodMonths),
    );
    const cutoff = cutoffDate.toISOString().slice(0, 10);

    const { data: metrics, error } = await supabase
      .from("startup_metrics")
      .select(
        "id, metric_date, mrr_aud, arr_aud, revenue_growth_pct, revenue, mau, dau, users_total, users_new, monthly_churn_pct, nrr_pct, cac_aud, ltv_aud, burn_rate_aud, runway_months, nps, notes, source, created_at",
      )
      .eq("email", user.email)
      .gte("metric_date", cutoff)
      .order("metric_date", { ascending: true });

    if (error) {
      console.error("[blockid:metrics] select failed", error);
      return NextResponse.json(
        { ok: false, error: "Failed to load metrics" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, metrics: metrics ?? [] });
  } catch (err) {
    console.error("[blockid:metrics] GET error", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
