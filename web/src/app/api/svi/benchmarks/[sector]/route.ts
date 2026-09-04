// GET /api/svi/benchmarks/[sector]
//
// Wave 27B — public read of the sector benchmark row. Falls back to the
// "default" row if the requested sector has no data yet. Cached for 1 hour
// at the CDN layer since the underlying refresh cron only runs nightly.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { industryToSector, isBenchmarkSector, type BenchmarkSector } from "@/lib/svi/sector-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BenchmarkRow {
  sector: string;
  dim_medians: Record<string, number>;
  dim_top_quartile: Record<string, number>;
  dim_bottom_quartile: Record<string, number>;
  sample_size: number;
  updated_at: string;
}

const FALLBACK: BenchmarkRow = {
  sector: "default",
  dim_medians: { ftv: 58, mpc: 52, ptd: 55, tre: 42, cgh: 48, iri: 45, lco: 50, svm: 47 },
  dim_top_quartile: { ftv: 75, mpc: 70, ptd: 72, tre: 65, cgh: 68, iri: 64, lco: 68, svm: 68 },
  dim_bottom_quartile: { ftv: 40, mpc: 35, ptd: 38, tre: 25, cgh: 30, iri: 28, lco: 32, svm: 30 },
  sample_size: 0,
  updated_at: new Date(0).toISOString(),
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sector: string }> },
) {
  const { sector: raw } = await params;
  const requested: BenchmarkSector = isBenchmarkSector(raw)
    ? raw
    : industryToSector(raw);

  const supabase = getSupabaseAdmin();
  const headers = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

  if (!supabase) {
    return NextResponse.json(
      { ok: true, benchmark: { ...FALLBACK, sector: requested }, fallback: true },
      { headers },
    );
  }

  // Try requested sector first.
  const { data: row } = await supabase
    .from("svi_sector_benchmarks")
    .select("sector, dim_medians, dim_top_quartile, dim_bottom_quartile, sample_size, updated_at")
    .eq("sector", requested)
    .maybeSingle();

  if (row) {
    return NextResponse.json({ ok: true, benchmark: row as BenchmarkRow, fallback: false }, { headers });
  }

  // Fall back to `default`.
  const { data: def } = await supabase
    .from("svi_sector_benchmarks")
    .select("sector, dim_medians, dim_top_quartile, dim_bottom_quartile, sample_size, updated_at")
    .eq("sector", "default")
    .maybeSingle();

  if (def) {
    return NextResponse.json(
      { ok: true, benchmark: { ...(def as BenchmarkRow), sector: requested }, fallback: true },
      { headers },
    );
  }

  return NextResponse.json(
    { ok: true, benchmark: { ...FALLBACK, sector: requested }, fallback: true },
    { headers },
  );
}
