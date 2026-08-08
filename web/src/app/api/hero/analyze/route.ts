import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  computeSVI,
  detectSector,
  extractSignals,
  SECTOR_LABELS,
  SVI_BENCHMARKS,
  SVI_STAGE_LABELS,
} from "@/lib/svi-analysis";
import { estimateValuation, formatAUD } from "@/lib/valuation";

/**
 * Anonymous instant-value endpoint for the marketing hero.
 *
 * Given a free-text business/idea description, returns a Startup Value
 * Index preview + AUD valuation range + top upgrade actions. No auth,
 * no persistence, no PII collected — this is the "vào là thấy giá trị
 * ngay" surface. Deterministic (no LLM) so it never exceeds ~50ms and
 * cannot fail from provider outages.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIN_TEXT = 20;
const MAX_TEXT = 4000;

export async function POST(request: Request) {
  const limited = enforceRateLimit(
    "hero-analyze",
    null,
    request,
    20,
    60_000,
  );
  if (limited) return limited;

  let body: { text?: string; sector?: string } = {};
  try {
    body = (await request.json()) as { text?: string; sector?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const text = (body.text ?? "").trim();
  if (text.length < MIN_TEXT) {
    return NextResponse.json(
      {
        ok: false,
        error: `Please describe your business or idea in at least ${MIN_TEXT} characters.`,
      },
      { status: 400 },
    );
  }
  const clipped = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;

  const signals = extractSignals({ rawText: clipped });
  const analysis = computeSVI(signals);
  const sectorKey = body.sector?.trim() || detectSector(clipped);
  const sectorLabel = sectorKey ? SECTOR_LABELS[sectorKey] ?? sectorKey : undefined;

  const dimensionScores =
    analysis.dimensionScores ??
    Object.fromEntries(analysis.subs.map((s) => [s.key, s.value]));

  const valuation = estimateValuation(
    analysis.totalSVI,
    analysis.stage,
    sectorKey ? { sector: sectorKey } : undefined,
    dimensionScores,
  );

  const topActions = analysis.nextActions.slice(0, 3).map((a) => ({
    priority: a.priority,
    title: a.title,
    detail: a.detail,
    impact: a.impact,
    impactPoints: parseImpactPoints(a.impact),
  }));

  const potentialScore =
    analysis.totalSVI +
    topActions.reduce((sum, a) => sum + a.impactPoints, 0);

  const bench = SVI_BENCHMARKS[analysis.stage] ?? SVI_BENCHMARKS[0]!;
  const percentile = estimatePercentile(analysis.totalSVI, bench);

  const strengths = analysis.subs
    .flatMap((s) => s.evidence.slice(0, 1))
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice(0, 4);

  const gaps = analysis.evidenceGaps.slice(0, 4).map((g) => ({
    priority: g.priority,
    label: g.label,
    action: g.action,
    impact: g.impact,
  }));

  return NextResponse.json({
    ok: true,
    svi: {
      score: analysis.totalSVI,
      baseline: analysis.baselineSVI,
      delta: analysis.netAdjustment,
      confidence: Math.round(analysis.confidenceMultiplier * 100),
      stage: analysis.stage,
      stageLabel: SVI_STAGE_LABELS[analysis.stage] ?? analysis.stageLabel,
      potentialScore,
      percentile,
      stageBenchmark: {
        median: bench.p50,
        topDecile: bench.p90,
        bottomDecile: bench.p10,
      },
    },
    valuation: {
      lowAud: valuation.low,
      midAud: valuation.mid,
      highAud: valuation.high,
      lowLabel: formatAUD(valuation.low),
      midLabel: formatAUD(valuation.mid),
      highLabel: formatAUD(valuation.high),
      method: valuation.method,
      confidence: valuation.confidence,
    },
    sector: sectorKey
      ? { key: sectorKey, label: sectorLabel }
      : null,
    dimensions: dimensionScores,
    strengths,
    gaps,
    topActions,
  });
}

function parseImpactPoints(impact: string): number {
  const m = impact.match(/([+-]?\d+)\s*SVI/i);
  return m ? Math.max(0, parseInt(m[1]!, 10)) : 0;
}

function estimatePercentile(
  score: number,
  bench: { p10: number; p25: number; p50: number; p75: number; p90: number },
): number {
  if (score <= bench.p10) return 10;
  if (score >= bench.p90) return 90;
  const points: Array<[number, number]> = [
    [bench.p10, 10],
    [bench.p25, 25],
    [bench.p50, 50],
    [bench.p75, 75],
    [bench.p90, 90],
  ];
  for (let i = 0; i < points.length - 1; i++) {
    const [xa, ya] = points[i]!;
    const [xb, yb] = points[i + 1]!;
    if (score >= xa && score <= xb) {
      const t = xb === xa ? 0 : (score - xa) / (xb - xa);
      return Math.round(ya + t * (yb - ya));
    }
  }
  return 50;
}

