import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeValuation, type ValuationInput } from "@/lib/valuation";
import { newSlug } from "@/lib/slug";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

function mapStage(numericStage: number): string {
  if (numericStage <= 1) return "idea";
  if (numericStage <= 2) return "validation";
  if (numericStage <= 4) return "mvp";
  return "growth";
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// POST /api/investor-data-room — Generate a one-click shareable data room
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
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
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  let body: { title?: string; expiresInDays?: number } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — use defaults
  }

  const accountId = user.id;
  const email = user.email;

  // ---- 1. Fetch SVI account + latest analysis ----
  const { data: sviAccount } = await supabase
    .from("svi_accounts")
    .select("id, current_svi, current_stage, startup_name")
    .eq("email", email)
    .maybeSingle();

  // ---- 2. Fetch latest snapshot for dimension scores ----
  let dimensions: Record<string, number> | null = null;
  if (sviAccount) {
    const { data: snapshot } = await supabase
      .from("svi_snapshots")
      .select("dimension_scores")
      .eq("account_id", sviAccount.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapshot?.dimension_scores) {
      dimensions = snapshot.dimension_scores as Record<string, number>;
    }
  }

  // ---- 3. Compute valuation ----
  let valuation = null;
  if (sviAccount) {
    const sviScore = (sviAccount.current_svi as number) ?? 100;
    const numericStage = (sviAccount.current_stage as number) ?? 0;

    // Fetch metrics for revenue data
    const { data: metrics } = await supabase
      .from("startup_metrics")
      .select("mrr_aud, arr_aud, revenue_growth_pct, monthly_churn_pct, burn_rate_aud, runway_months")
      .eq("account_id", sviAccount.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const input: ValuationInput = {
      sviScore,
      stage: mapStage(numericStage),
      mrrAud: metrics?.mrr_aud ?? undefined,
      arrAud: metrics?.arr_aud ?? undefined,
      revenueGrowthPct: metrics?.revenue_growth_pct ?? undefined,
      monthlyChurnPct: metrics?.monthly_churn_pct ?? undefined,
      burnRateAud: metrics?.burn_rate_aud ?? undefined,
      runwayMonths: metrics?.runway_months ?? undefined,
      dimensions: dimensions
        ? {
            ftv: dimensions.ftv,
            mpc: dimensions.mpc,
            ptd: dimensions.ptd,
            tre: dimensions.tre,
            cgh: dimensions.cgh,
            iri: dimensions.iri,
            lco: dimensions.lco,
            svm: dimensions.svm,
          }
        : undefined,
    };
    valuation = computeValuation(input);
  }

  // ---- 4. Fetch cap table ----
  const [classesRes, holdersRes, esopRes] = await Promise.all([
    supabase
      .from("share_classes")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true }),
    supabase
      .from("shareholders")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true }),
    supabase
      .from("esop_pool")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle(),
  ]);

  const shareClasses = classesRes.data ?? [];
  const shareholders = holdersRes.data ?? [];
  const esopPool = esopRes.data ?? null;

  const totalIssued = shareholders.reduce(
    (sum: number, s: { shares_held: number }) => sum + Number(s.shares_held),
    0,
  );
  const esopShares = esopPool ? Number(esopPool.total_pool_shares) : 0;
  const fullyDilutedTotal = totalIssued + esopShares;

  const capTable = {
    shareClasses,
    shareholders: shareholders.map(
      (s: { shares_held: number; [key: string]: unknown }) => ({
        ...s,
        ownership_pct:
          fullyDilutedTotal > 0
            ? Number(((Number(s.shares_held) / fullyDilutedTotal) * 100).toFixed(2))
            : 0,
      }),
    ),
    esopPool,
    summary: {
      totalIssued,
      fullyDilutedTotal,
      esopShares,
    },
  };

  // ---- 5. Fetch evidence items ----
  let evidence: unknown[] = [];
  if (sviAccount) {
    const { data: evidenceRows } = await supabase
      .from("svi_evidence")
      .select("id, label, dimension, evidence_type, confidence_level, created_at")
      .eq("account_id", sviAccount.id)
      .order("created_at", { ascending: false })
      .limit(100);
    evidence = evidenceRows ?? [];
  }

  // ---- 6. Fetch metrics ----
  let metrics = null;
  if (sviAccount) {
    const { data: metricsRow } = await supabase
      .from("startup_metrics")
      .select("*")
      .eq("account_id", sviAccount.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    metrics = metricsRow;
  }

  // ---- 7. Build sections ----
  const sections = {
    svi: sviAccount
      ? {
          score: sviAccount.current_svi,
          stage: sviAccount.current_stage,
          startupName: sviAccount.startup_name,
          dimensions,
        }
      : null,
    valuation,
    capTable,
    evidence,
    metrics,
  };

  // ---- 8. Create shareable token and store ----
  const token = newSlug();
  const title = body.title || `${sviAccount?.startup_name ?? "BlockID"} Data Room`;
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString()
    : null;

  const { error: insertErr } = await supabase.from("data_rooms").insert({
    account_id: accountId,
    email,
    token,
    title,
    sections,
    is_active: true,
    view_count: 0,
    expires_at: expiresAt,
  });

  if (insertErr) {
    console.error("[investor-data-room] insert failed", insertErr);
    return NextResponse.json(
      { ok: false, error: "Failed to create data room" },
      { status: 500 },
    );
  }

  const url = `${siteUrl()}/api/investor-data-room?token=${token}`;

  return NextResponse.json({
    ok: true,
    token,
    url,
    sections: Object.keys(sections),
  });
}

// ---------------------------------------------------------------------------
// GET /api/investor-data-room?token=xxx — Public investor view (no auth)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "token query parameter is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  // Fetch data room by token
  const { data: room, error } = await supabase
    .from("data_rooms")
    .select("*")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !room) {
    return NextResponse.json(
      { ok: false, error: "Data room not found or inactive" },
      { status: 404 },
    );
  }

  // Check expiry
  if (room.expires_at && new Date(room.expires_at as string) < new Date()) {
    return NextResponse.json(
      { ok: false, error: "This data room link has expired" },
      { status: 410 },
    );
  }

  // Track the view
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const viewerIpHash = hashIp(ip);

  await Promise.all([
    supabase.from("data_room_views").insert({
      data_room_id: room.id,
      viewer_ip_hash: viewerIpHash,
    }),
    supabase
      .from("data_rooms")
      .update({ view_count: (room.view_count as number) + 1 })
      .eq("id", room.id),
  ]);

  return NextResponse.json({
    ok: true,
    title: room.title,
    sections: room.sections,
    createdAt: room.created_at,
    viewCount: (room.view_count as number) + 1,
  });
}
