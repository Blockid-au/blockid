// GET /api/abs/lookup?anzsic=J5810
// GET /api/abs/lookup?keyword=saas&addressablePct=0.2&targetSharePct=0.01
//
// Guide gap closed: docs/plans/atlassian-standard-mapping-goal.md §1 phase 3
// P1 gap ("IBISWorld / ABS lookup not surfaced; no `/api/abs/lookup` stub"),
// spun off as P3b (route wrapper half of the P3a fixture ship). Companion
// to /api/abr/lookup (ABN) and /api/asic/extract (ACN) — same public-lookup
// posture, no auth, edge-cache-safe.
//
// Behaviour:
//   * Reads `anzsic` (5-char ANZSIC 2006 class code) OR `keyword` OR the
//     `sector` alias (which routes through searchByKeyword).
//   * Optional `addressablePct` (0..1, default 0.2) + `targetSharePct`
//     (0..1, default 0.01) sizes TAM → SAM → SOM using the anchor helper.
//   * 400 when no lookup input present; 404 when the input matches no
//     seeded industry — mirrors abn.ts / acn.ts error-code posture.
//
// Boundary: this returns anchor industry sizing, not personal financial
// product advice. The AU_MARKET_LOOKUP_DISCLAIMER travels on every 200 so
// downstream renderers cannot leak the anchor without the ABS-provenance
// hedge (s766B Corps Act guard applied at source).

import { NextRequest, NextResponse } from "next/server";
import {
  AU_MARKET_LOOKUP_DISCLAIMER,
  estimateTamSamSom,
  lookupByAnzsic,
  searchByKeyword,
} from "@/lib/market/au-market-lookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parsePct(raw: string | null, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const anzsic = (url.searchParams.get("anzsic") ?? "").trim();
  const keyword =
    (url.searchParams.get("keyword") ?? url.searchParams.get("sector") ?? "").trim();
  const addressablePct = parsePct(url.searchParams.get("addressablePct"), 0.2);
  const targetSharePct = parsePct(url.searchParams.get("targetSharePct"), 0.01);

  if (!anzsic && !keyword) {
    return NextResponse.json(
      {
        error: "missing_lookup_input",
        message:
          "supply one of ?anzsic=<ANZSIC 2006 class code> or ?keyword=<industry term>",
      },
      { status: 400 },
    );
  }

  const estimate = estimateTamSamSom({
    anzsicCode: anzsic || undefined,
    keyword: keyword || undefined,
    addressablePct,
    targetSharePct,
  });

  if (!estimate) {
    // Explicit ANZSIC hit that missed → tell the caller unambiguously so
    // they don't confuse it with a keyword typo. Keyword misses fall
    // through the same branch — surface the raw input either way.
    const industryHit = anzsic ? lookupByAnzsic(anzsic) : null;
    return NextResponse.json(
      {
        error: industryHit ? "industry_missing_tam" : "industry_not_found",
        message: anzsic
          ? `no seeded snapshot for ANZSIC code ${anzsic.toUpperCase()}`
          : `no seeded industry matches keyword "${keyword}"`,
        input: { anzsic: anzsic || null, keyword: keyword || null },
      },
      { status: 404 },
    );
  }

  // Attach up to 5 additional keyword-driven suggestions so the founder
  // can pivot to a sibling class if the auto-pick isn't the segment they
  // meant (e.g. "software" hits SaaS but they meant IaaS).
  const suggestions =
    keyword && !anzsic
      ? searchByKeyword(keyword, 5)
          .filter((s) => s.anzsicCode !== estimate.industry.anzsicCode)
          .slice(0, 4)
          .map((s) => ({
            anzsic_code: s.anzsicCode,
            label: s.label,
            tam_aud: s.tamAud,
          }))
      : [];

  return NextResponse.json(
    {
      industry: {
        anzsic_code: estimate.industry.anzsicCode,
        division: estimate.industry.division,
        label: estimate.industry.label,
        keywords: estimate.industry.keywords,
        cagr: estimate.industry.cagr,
        business_count: estimate.industry.businessCount,
        sources: estimate.industry.sources,
        notes: estimate.industry.notes,
      },
      tam_aud: estimate.tamAud,
      sam_aud: estimate.samAud,
      som_aud: estimate.somAud,
      addressable_pct: estimate.addressablePct,
      target_share_pct: estimate.targetSharePct,
      suggestions,
      disclaimer: AU_MARKET_LOOKUP_DISCLAIMER,
    },
    {
      status: 200,
      // Static seed — industry snapshots refresh at commit-time, not per
      // request. 1h edge cache matches the abn/acn route posture.
      headers: { "cache-control": "public, max-age=3600, s-maxage=3600" },
    },
  );
}
