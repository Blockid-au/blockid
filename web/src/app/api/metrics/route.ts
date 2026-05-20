import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Find or create svi_account by email
// ---------------------------------------------------------------------------

async function findOrCreateAccount(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  email: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("svi_accounts")
    .insert({ email, last_active_at: new Date().toISOString() })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[blockid:metrics] svi_accounts insert failed", error);
    return null;
  }
  return created.id as string;
}

// ---------------------------------------------------------------------------
// Metric field whitelist — only these columns can be written
// ---------------------------------------------------------------------------

const METRIC_FIELDS = [
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
] as const;

type MetricField = (typeof METRIC_FIELDS)[number];

function isMetricField(key: string): key is MetricField {
  return (METRIC_FIELDS as readonly string[]).includes(key);
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
      metrics?: Record<string, number | null>;
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
    const metricData: Record<string, number | null> = {};
    for (const [key, val] of Object.entries(body.metrics)) {
      if (isMetricField(key)) {
        if (val !== null && (typeof val !== "number" || !isFinite(val))) {
          return NextResponse.json(
            { ok: false, error: `${key} must be a finite number or null` },
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

    const accountId = await findOrCreateAccount(supabase, user.email);
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
        "id, metric_date, mrr_aud, arr_aud, revenue_growth_pct, mau, dau, monthly_churn_pct, nrr_pct, cac_aud, ltv_aud, burn_rate_aud, runway_months, source, created_at",
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
