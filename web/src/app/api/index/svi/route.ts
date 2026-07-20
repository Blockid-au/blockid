// GET /api/index/svi?bucket=overall|sector|stage[&format=json|csv]
//
// Public, anonymised aggregates from the SVI Index. Powers the /dataset
// marketing surface and the "download the raw data" story that backs the
// "S&P 500 for Australian startups" positioning.
//
// PII guard: this route calls only the aggregate helpers in
// `@/lib/svi-index-aggregates`, which pull a fixed list of numeric+bucket
// columns from svi_index_snapshots. Never company_name, email, user_id,
// raw_input, or analysis_json.

import { NextResponse } from "next/server";
import {
  getOverallAggregates,
  getSectorAggregates,
  getStageAggregates,
  toCsv,
  type SviBucket,
} from "@/lib/svi-index-aggregates";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const CACHE_HEADER = "public, max-age=300, stale-while-revalidate=600";
const DISCLAIMER =
  "General information only. Aggregated from anonymised SVI snapshots. Not investment, financial, or legal advice. Blockid.au and Auschain Pty Ltd (ACN 659 615 111) do not hold an Australian Financial Services Licence.";

const VALID_BUCKETS = new Set<SviBucket>(["overall", "sector", "stage"]);
const VALID_FORMATS = new Set<string>(["json", "csv"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bucketParam = (searchParams.get("bucket") ?? "overall").toLowerCase();
  const formatParam = (searchParams.get("format") ?? "json").toLowerCase();

  if (!VALID_BUCKETS.has(bucketParam as SviBucket)) {
    return NextResponse.json(
      {
        error: "invalid bucket",
        allowed: Array.from(VALID_BUCKETS),
      },
      { status: 400 },
    );
  }
  if (!VALID_FORMATS.has(formatParam)) {
    return NextResponse.json(
      {
        error: "invalid format",
        allowed: Array.from(VALID_FORMATS),
      },
      { status: 400 },
    );
  }

  const bucket = bucketParam as SviBucket;
  const format = formatParam as "json" | "csv";

  try {
    if (bucket === "overall") {
      const overall = await getOverallAggregates();
      if (format === "csv") {
        const csv = toCsv([
          {
            count: overall.count,
            mean: overall.mean,
            median: overall.medianSvi,
            p10: overall.p10,
            p25: overall.p25,
            p50: overall.p50,
            p75: overall.p75,
            p90: overall.p90,
            updated_at: overall.updatedAt,
          },
        ]);
        return csvResponse(csv, "svi-index-overall.csv");
      }
      return NextResponse.json(
        {
          bucket,
          data: overall,
          disclaimer: DISCLAIMER,
          source: "svi_index_snapshots (anonymised)",
        },
        { headers: { "Cache-Control": CACHE_HEADER } },
      );
    }

    if (bucket === "sector") {
      const rows = await getSectorAggregates();
      if (format === "csv") {
        const csv = toCsv(
          rows.map((r) => ({
            sector: r.sector,
            count: r.count,
            median_svi: r.medianSvi,
            p25: r.p25,
            p75: r.p75,
            median_stage: r.medianStage,
          })),
          ["sector", "count", "median_svi", "p25", "p75", "median_stage"],
        );
        return csvResponse(csv, "svi-index-by-sector.csv");
      }
      return NextResponse.json(
        {
          bucket,
          data: rows,
          disclaimer: DISCLAIMER,
          source: "svi_index_snapshots (anonymised, k-anon ≥ 5)",
        },
        { headers: { "Cache-Control": CACHE_HEADER } },
      );
    }

    // bucket === "stage"
    const rows = await getStageAggregates();
    if (format === "csv") {
      const csv = toCsv(
        rows.map((r) => ({
          stage: r.stage,
          count: r.count,
          median_svi: r.medianSvi,
          p25: r.p25,
          p75: r.p75,
        })),
        ["stage", "count", "median_svi", "p25", "p75"],
      );
      return csvResponse(csv, "svi-index-by-stage.csv");
    }
    return NextResponse.json(
      {
        bucket,
        data: rows,
        disclaimer: DISCLAIMER,
        source: "svi_index_snapshots (anonymised, k-anon ≥ 5)",
      },
      { headers: { "Cache-Control": CACHE_HEADER } },
    );
  } catch (err) {
    console.error("[blockid:svi-index] aggregate read failed", err);
    return NextResponse.json(
      { error: "aggregate read failed", disclaimer: DISCLAIMER },
      { status: 500 },
    );
  }
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": CACHE_HEADER,
    },
  });
}
