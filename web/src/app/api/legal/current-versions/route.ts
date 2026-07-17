// GET /api/legal/current-versions?jurisdiction=AU
//
// Returns the newest active disclaimer_registry row per `kind` for the
// requested jurisdiction. Clients (privacy banner, consent forms,
// disclaimer footers) use this to detect when their pinned version is
// stale and prompt re-consent.
//
// Shape:
//   { versions: { [kind]: { version, hash, effective_from } } }
//
// Fails closed on Supabase unavailability so the client can retry
// rather than trusting a cached stale copy.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RegistryRow {
  kind: string | null;
  version: string | null;
  hash: string | null;
  effective_from: string | null;
  effective_to: string | null;
  jurisdiction: string | null;
}

interface VersionEntry {
  version: string;
  hash: string;
  effective_from: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawJurisdiction = (url.searchParams.get("jurisdiction") || "AU").trim();
  const jurisdiction = rawJurisdiction.length > 0
    ? rawJurisdiction.toUpperCase()
    : "AU";

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, reason: "Supabase unavailable" },
      { status: 503 },
    );
  }

  // Pull every active row for this jurisdiction — a single query beats
  // one-per-kind round-trips, and we fold to newest-per-kind in memory.
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("disclaimer_registry")
    .select("kind, version, hash, effective_from, effective_to, jurisdiction")
    .eq("jurisdiction", jurisdiction)
    .lte("effective_from", nowIso)
    .order("effective_from", { ascending: false })
    .limit(500);

  if (error) {
    console.error(
      "[legal:current-versions] query failed",
      error.message,
    );
    return NextResponse.json(
      { ok: false, reason: "Registry query failed" },
      { status: 500 },
    );
  }

  const versions: Record<string, VersionEntry> = {};
  for (const row of (data ?? []) as RegistryRow[]) {
    if (!row.kind || !row.version || !row.hash || !row.effective_from) continue;
    // Skip rows whose effective_to has already passed.
    if (row.effective_to && row.effective_to <= nowIso) continue;
    // First hit per kind wins because rows arrive newest-first.
    if (versions[row.kind]) continue;
    versions[row.kind] = {
      version: row.version,
      hash: row.hash,
      effective_from: row.effective_from,
    };
  }

  return NextResponse.json({
    ok: true,
    jurisdiction,
    versions,
  });
}
