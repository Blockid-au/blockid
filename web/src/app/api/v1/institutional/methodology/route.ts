// GET /api/v1/institutional/methodology — the methodology facts an
// integration should pin (G21 P3-B): SVI_VERSION, the score bands, the
// eight dimensions with weights, the evidence confidence ladder, the
// benchmark n-rules (score-governance § 7) and the governance / methodology
// URLs. Static per deployment; the ETag changes only with a release.

import { NextResponse } from "next/server";
import { authenticateInstitutional, institutionalOk } from "@/lib/api-v1/institutional";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { BENCHMARK_MIN_N, BENCHMARK_N_RULES } from "@/lib/benchmarks/publication-rules";
import { CONFIDENCE_LEVELS } from "@/lib/evidence/confidence-cap";
import { DIMENSION_OWNERS, DIM_ORDER } from "@/lib/report-pipeline/dimension-owners";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The SVI bands the Assessment Card and every report print (lib/report-visuals/palette.ts bandFor). */
export const SVI_BANDS = Object.freeze([
  { band: "strong", min: 70, max: 100 },
  { band: "developing", min: 40, max: 69 },
  { band: "early", min: 0, max: 39 },
  { band: "pending", min: null, max: null, note: "no confident number yet — dimensions still pending" },
]);

export function methodologyBody(): Record<string, unknown> {
  return {
    svi_version: SVI_VERSION,
    bands: SVI_BANDS,
    dimensions: DIM_ORDER.map((dim) => ({ key: dim, title: DIMENSION_OWNERS[dim].title, weight: DIMENSION_OWNERS[dim].weight })),
    evidence_confidence_levels: CONFIDENCE_LEVELS,
    benchmark_rules: {
      floor: BENCHMARK_MIN_N,
      n_rules: BENCHMARK_N_RULES.map((r) => ({ band: r.band, min_n: r.minN, max_n: r.maxN, shows: r.shows })),
      counting: "n counts companies — one latest score per company, never one per analysis",
      segments: "stage-only and stage × sector, recomputed nightly; a sector segment under the floor falls back to the stage segment and says so",
    },
    principles: [
      "BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.",
      "Overrides and corrections are appended, never overwrite; the canonical score is unchanged.",
      "No benchmark is published without its n.",
    ],
    urls: {
      methodology: "https://blockid.au/methodology",
      governance: "https://blockid.au/methodology/governance",
      api_docs: "https://blockid.au/developers/api",
    },
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticateInstitutional(request);
  if (!auth.ok) return auth.response;
  return institutionalOk(request, auth.principal, { data: methodologyBody() }, { resource: "methodology", detail: { svi_version: SVI_VERSION } });
}
