import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeVestingTimeline, type VestingSchedule } from "@/lib/vesting";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helper: load and authorize a single schedule
// ---------------------------------------------------------------------------

async function loadSchedule(id: string, userId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: "Database not configured", status: 503 } as const;

  const { data, error } = await supabase
    .from("vesting_schedules")
    .select("*")
    .eq("id", id)
    .eq("cap_table_id", userId)
    .single();

  if (error || !data) {
    return { error: "Vesting schedule not found", status: 404 } as const;
  }

  return { data } as const;
}

// ---------------------------------------------------------------------------
// GET /api/vesting/[id] — Single schedule with computed timeline
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const result = await loadSchedule(id, user.id);
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const row = result.data;
  const schedule: VestingSchedule = {
    id: row.id,
    shareholderName: row.shareholder_name,
    grantDate: row.grant_date,
    totalShares: Number(row.total_shares),
    vestedShares: Number(row.vested_shares),
    vestingType: row.vesting_type,
    cliffMonths: row.cliff_months,
    totalMonths: row.total_months,
    singleTrigger: row.single_trigger,
    doubleTrigger: row.double_trigger,
    status: row.status,
  };

  const timeline = computeVestingTimeline(schedule);

  return NextResponse.json({ ok: true, schedule: row, timeline });
}

// ---------------------------------------------------------------------------
// PATCH /api/vesting/[id] — Update schedule (terminate, accelerate)
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const result = await loadSchedule(id, user.id);
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Terminate
  if (body.action === "terminate") {
    updates.status = "terminated";
    updates.terminated_at = new Date().toISOString().split("T")[0];
    updates.termination_type = body.terminationType
      ? String(body.terminationType)
      : "voluntary";
  }

  // Accelerate
  if (body.action === "accelerate") {
    updates.status = "accelerated";
    updates.vested_shares = Number(result.data.total_shares);
  }

  // Update notes
  if (typeof body.notes === "string") {
    updates.notes = body.notes.trim() || null;
  }

  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from("vesting_schedules")
    .update(updates)
    .eq("id", id)
    .eq("cap_table_id", user.id)
    .select()
    .single();

  if (error) {
    console.error("[vesting] update error", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update schedule" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, schedule: data });
}

// ---------------------------------------------------------------------------
// DELETE /api/vesting/[id] — Remove schedule
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const result = await loadSchedule(id, user.id);
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase
    .from("vesting_schedules")
    .delete()
    .eq("id", id)
    .eq("cap_table_id", user.id);

  if (error) {
    console.error("[vesting] delete error", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete schedule" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
