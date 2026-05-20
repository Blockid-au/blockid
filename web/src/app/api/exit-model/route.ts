import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  calculateExit,
  generateScenarios,
  type CapTableInput,
  type ExitScenario,
  type ShareholderInput,
  type ESOPInput,
} from "@/lib/exit-modeling";

export const dynamic = "force-dynamic";

/**
 * Load the user's cap table from the database and convert to CapTableInput.
 */
async function loadCapTable(
  accountId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<CapTableInput> {
  const [holdersRes, classesRes, esopRes] = await Promise.all([
    supabase
      .from("shareholders")
      .select("*")
      .eq("account_id", accountId),
    supabase
      .from("share_classes")
      .select("*")
      .eq("account_id", accountId),
    supabase
      .from("esop_pool")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle(),
  ]);

  const holders = holdersRes.data ?? [];
  const classes = classesRes.data ?? [];
  const esopRow = esopRes.data;

  // Build a map of share class id -> class info
  const classMap = new Map<string, { class_type: string; liquidation_preference: number | null; price_per_share: number }>();
  for (const c of classes) {
    classMap.set(c.id, {
      class_type: c.class_type,
      liquidation_preference: c.liquidation_preference ? Number(c.liquidation_preference) : null,
      price_per_share: Number(c.price_per_share) || 0,
    });
  }

  const shareholders: ShareholderInput[] = holders.map(
    (h: {
      name: string;
      role: string;
      shares_held: number;
      share_class_id: string | null;
      vesting_start: string | null;
    }) => {
      const cls = h.share_class_id ? classMap.get(h.share_class_id) : null;
      return {
        name: h.name,
        role: h.role || "founder",
        shares: Number(h.shares_held) || 0,
        shareClassType: cls?.class_type ?? "ordinary",
        liquidationMultiple: cls?.liquidation_preference ?? undefined,
        vestingStart: h.vesting_start,
        pricePerShare: cls?.price_per_share ?? 0,
      };
    },
  );

  const totalIssued = shareholders.reduce((sum, s) => sum + s.shares, 0);
  const esopShares = esopRow ? Number(esopRow.total_pool_shares) : 0;
  const fullyDiluted = totalIssued + esopShares;

  let esop: ESOPInput | null = null;
  if (esopRow) {
    esop = {
      totalPoolShares: esopShares,
      allocatedShares: Number(esopRow.allocated_shares) || 0,
      exercisePrice: 0.001, // default exercise price; could be stored in DB
    };
  }

  return {
    shareholders,
    esop,
    totalShares: fullyDiluted,
  };
}

// ---------------------------------------------------------------------------
// POST /api/exit-model — calculate exit for a specific scenario
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const method = (body.method as ExitScenario["method"]) || "acquisition";
  const exitValuation = Number(body.exitValuation);

  if (!exitValuation || exitValuation <= 0) {
    return NextResponse.json(
      { ok: false, error: "exitValuation must be a positive number" },
      { status: 400 },
    );
  }

  const validMethods = ["acquisition", "ipo", "secondary", "buyout"];
  if (!validMethods.includes(method)) {
    return NextResponse.json(
      { ok: false, error: `Invalid method. Must be one of: ${validMethods.join(", ")}` },
      { status: 400 },
    );
  }

  const capTable = await loadCapTable(user.id, supabase);

  if (capTable.shareholders.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No shareholders found. Set up your cap table first." },
      { status: 400 },
    );
  }

  const scenario: ExitScenario = {
    method,
    exitValuation,
    exitMultiple: body.exitMultiple ? Number(body.exitMultiple) : undefined,
  };

  const result = calculateExit(scenario, capTable);

  return NextResponse.json({ ok: true, result });
}

// ---------------------------------------------------------------------------
// GET /api/exit-model — pre-computed scenarios at 3x, 5x, 10x, 20x revenue
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const capTable = await loadCapTable(user.id, supabase);

  if (capTable.shareholders.length === 0) {
    return NextResponse.json({
      ok: true,
      scenarios: [],
      message: "No shareholders found. Set up your cap table first.",
    });
  }

  // Try to get annual revenue from metrics
  let annualRevenue = 0;

  const { data: latestMetric } = await supabase
    .from("startup_metrics")
    .select("arr_aud, mrr_aud")
    .eq("email", user.email)
    .order("metric_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestMetric) {
    annualRevenue = Number(latestMetric.arr_aud) || (Number(latestMetric.mrr_aud) || 0) * 12;
  }

  // Default to $100K ARR if no metrics
  if (annualRevenue <= 0) {
    annualRevenue = 100_000;
  }

  const scenarios = generateScenarios(capTable, annualRevenue);

  return NextResponse.json({
    ok: true,
    annualRevenue,
    scenarios,
  });
}
