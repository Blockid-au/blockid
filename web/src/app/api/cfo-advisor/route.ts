import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI } from "@/lib/ai-client";
import { analyzeFinancials, type FinancialSignals } from "@/lib/adk/agents";

export const dynamic = "force-dynamic";

/** Adapter: ADK ModelCaller (system, user, maxTokens) → free callAI(). */
const adkModel = async (system: string, user: string, maxTokens: number): Promise<string> =>
  (await callAI({ system, user, maxTokens, timeoutMs: 90_000 })).text;

function toNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// ---------------------------------------------------------------------------
// POST /api/cfo-advisor — CFO financial-advisor agent (Google Agent Garden port).
// Produces grounded financial analysis + stage-appropriate recommendations.
// Body: { startupName, stage?, monthlyRevenueAud?, monthlyBurnAud?,
//         runwayMonths?, cashAud?, notes? }
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const startupName = typeof body.startupName === "string" ? body.startupName.trim() : "";
  if (!startupName) {
    return NextResponse.json({ ok: false, error: "Missing 'startupName'" }, { status: 400 });
  }

  const signals: FinancialSignals = {
    startupName,
    stage: typeof body.stage === "string" ? body.stage : undefined,
    monthlyRevenueAud: toNum(body.monthlyRevenueAud),
    monthlyBurnAud: toNum(body.monthlyBurnAud),
    runwayMonths: toNum(body.runwayMonths),
    cashAud: toNum(body.cashAud),
    notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : undefined,
  };

  try {
    const result = await analyzeFinancials(signals, adkModel);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "Advisor unavailable — no AI provider responded" },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      analysis: result.analysis,
      recommendations: result.recommendations,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "CFO advisor failed" },
      { status: 500 },
    );
  }
}
