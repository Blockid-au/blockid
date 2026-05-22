import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getProjectIdFromRequest, findOrCreateSVIAccount } from "@/lib/projects";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, snapshots: [], currentSVI: null, weekDelta: null, monthDelta: null });
  }

  const supabase = getSupabaseAdmin()!;

  // Resolve active project and find the correct SVI account
  const projectId = await getProjectIdFromRequest();
  const accountId = await findOrCreateSVIAccount(user.email, projectId);

  if (!accountId) {
    return NextResponse.json({ ok: true, snapshots: [], currentSVI: null, weekDelta: null, monthDelta: null });
  }

  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id, current_svi, current_stage")
    .eq("id", accountId)
    .single();

  if (!account) {
    return NextResponse.json({ ok: true, snapshots: [], currentSVI: null, weekDelta: null, monthDelta: null });
  }

  // Load last 12 snapshots (weekly data points)
  const { data: snapshots, error } = await supabase
    .from("svi_snapshots")
    .select("snapshot_date, svi_total, delta, stage")
    .eq("account_id", account.id)
    .order("snapshot_date", { ascending: false })
    .limit(12);

  if (error) {
    console.error("[blockid:svi-history] snapshot fetch failed", error);
    return NextResponse.json({ ok: false, error: "Failed to load history" }, { status: 500 });
  }

  const rows = snapshots ?? [];

  // Week delta: delta from the most recent snapshot
  const weekDelta = rows.length > 0 ? (rows[0].delta ?? 0) : 0;

  // Month delta: difference between current SVI and the snapshot ~4 weeks ago
  let monthDelta = 0;
  if (rows.length >= 4) {
    monthDelta = (account.current_svi ?? 0) - (rows[3].svi_total ?? 0);
  } else if (rows.length > 0) {
    monthDelta = (account.current_svi ?? 0) - (rows[rows.length - 1].svi_total ?? 0);
  }

  // Reverse to chronological order for chart display
  const chronological = [...rows].reverse().map((s) => ({
    date: s.snapshot_date as string,
    svi: s.svi_total as number,
    delta: s.delta as number | null,
    stage: s.stage as number | undefined,
  }));

  return NextResponse.json({
    ok: true,
    snapshots: chronological,
    currentSVI: account.current_svi ?? null,
    weekDelta,
    monthDelta,
  });
}

export const dynamic = "force-dynamic";
