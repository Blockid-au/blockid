// POST /api/svi/stage-classify — thin wrapper over detectMaturity + detectStage
//
// Powers the SmartIntake typing hint. Accepts short text and returns a
// stage guess plus reasons — deterministic, no LLM call.

import { NextResponse } from "next/server";
import { extractSignals, detectStage } from "@/lib/svi-analysis";
import { detectMaturity } from "@/lib/agents/maturity-detector";
import { apiRoute } from "@/lib/audit/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  text?: string;
  url?: string;
}

const CONFIDENCE_TABLE: Record<string, number> = {
  low: 0.35,
  medium: 0.6,
  high: 0.85,
};

async function POST_handler(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const rawText = (body.text ?? "").toString();
  const url = body.url?.toString();

  if (!rawText.trim() && !url) {
    return NextResponse.json(
      { ok: false, error: "Provide `text` or `url`." },
      { status: 400 },
    );
  }

  const signals = extractSignals({ rawText });
  const stage = detectStage(signals);
  const maturity = detectMaturity({ rawText, url });

  return NextResponse.json({
    ok: true,
    stage,
    stageLabel:
      ["Concept", "Validated Idea", "MVP / Prototype", "Early Traction", "Revenue", "Growth", "Scale", "Corporation"][stage] ??
      "Unknown",
    maturity: maturity.level,
    isEstablished: maturity.isEstablished,
    confidence: CONFIDENCE_TABLE[maturity.confidence] ?? 0.5,
    reasons: maturity.evidence,
    signals: {
      hasProduct: signals.hasProduct,
      hasRevenue: signals.hasRevenue,
      hasCustomers: signals.hasCustomers,
      revenueBand: signals.revenueBand,
      hasCapTable: signals.hasCapTable,
      hasDataRoom: signals.hasDataRoom,
    },
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/svi/stage-classify/route.ts", method: "POST" }, POST_handler);
