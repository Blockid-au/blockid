// GET /api/v1/institutional/benchmarks?stage=&sector= — the published
// benchmark segments (G21 P3-B; score-governance § 7). Every row carries
// `n` and the publication band; a segment under the floor (n < 10) is never
// in the list — RLS hides it from clients and the projection drops it.
//
//   Query  stage (0–12, optional) · sector (optional, normalised — "SaaS /
//          Software" and "saas" are the same segment).
//   200    { ok, data: PublishedSegmentRow[], meta: { count, rule, floor } }
//          — an empty `data` means no segment at that filter has reached
//          the floor yet (or the nightly table is not populated).

import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateInstitutional, institutionalOk, parseQuery, sectorParam, stageParam } from "@/lib/api-v1/institutional";
import { listPublishedSegments } from "@/lib/benchmarks/segments-db";
import { normaliseSector } from "@/lib/benchmarks/segments";
import { BENCHMARK_MIN_N } from "@/lib/benchmarks/publication-rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QUERY = z.object({ stage: stageParam.optional(), sector: sectorParam.optional() });

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticateInstitutional(request);
  if (!auth.ok) return auth.response;
  const q = parseQuery(new URL(request.url).searchParams, QUERY);
  if (!q.ok) return q.response;
  const stage = q.value.stage ?? null;
  const sector = q.value.sector ? normaliseSector(q.value.sector) : null;
  const data = await listPublishedSegments({ stage, sector });
  return institutionalOk(
    request,
    auth.principal,
    {
      data,
      meta: {
        count: data.length,
        stage,
        sector,
        floor: BENCHMARK_MIN_N,
        rule: "published where n >= 10; 10–29 indicative, 30–99 benchmark, 100+ segmented (stage × sector)",
        governance: "https://blockid.au/methodology/governance",
      },
    },
    { resource: "benchmarks", detail: { count: data.length, stage, sector } },
  );
}
