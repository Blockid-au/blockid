// /api/equity/grants — ESOP Grant Register (T0099)
//
//   GET  /api/equity/grants?planId=xxx   → list all grants in ESOP pool
//   POST /api/equity/grants              → create individual grant
//
// POST body:
//   { planId, memberId, grantDate, shares, exercisePrice,
//     vestingMonths, cliffMonths, scheduleType }
//
// Creates:
//   1. equity_members row (if memberId not provided, creates new member)
//   2. equity_vesting_schedules row
//   3. Computes vesting timeline via /api/equity/calculate
//   4. Updates esop_pools.shares_allocated (if column exists) or tracks via sum
//
// Returns: { grant, vestingTimeline }

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { calculateVestingSchedule } from "@/lib/equity/engine";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/equity/grants?planId=xxx
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, grants: [], poolSummary: null });
  }

  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId");

  if (!planId) {
    return NextResponse.json({ ok: false, error: "planId required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin()!;

  // Verify plan ownership
  const { data: plan } = await supabase
    .from("equity_plans")
    .select("id, user_id, total_shares, pre_money_valuation, startup_name")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ ok: false, error: "Plan not found" }, { status: 404 });
  }

  // Fetch ESOP pool
  const { data: pool } = await supabase
    .from("esop_pools")
    .select("id, pool_size_shares, pool_size_percent, scheme_type, au_tax_concession")
    .eq("equity_plan_id", planId)
    .maybeSingle();

  // Fetch all option holders (members with options_granted > 0)
  const { data: members } = await supabase
    .from("equity_members")
    .select("id, name, email, role, share_class, shares_issued, options_granted, join_date, notes")
    .eq("equity_plan_id", planId)
    .gt("options_granted", 0)
    .order("join_date", { ascending: true });

  // Fetch vesting schedules for all option holders
  const memberIds = (members ?? []).map((m) => m.id as string);
  let schedules: Array<Record<string, unknown>> = [];

  if (memberIds.length > 0) {
    const { data: scheds } = await supabase
      .from("equity_vesting_schedules")
      .select("*")
      .in("member_id", memberIds)
      .order("created_at", { ascending: false });
    schedules = (scheds ?? []) as Array<Record<string, unknown>>;
  }

  const scheduleByMember = new Map(
    schedules.map((s) => [s.member_id as string, s])
  );

  // Build grant register with computed vesting status
  const today = new Date().toISOString().slice(0, 10);
  const pps =
    plan.pre_money_valuation && plan.total_shares
      ? Number(plan.pre_money_valuation) / Number(plan.total_shares)
      : 0;

  const grants = (members ?? []).map((m) => {
    const sched = scheduleByMember.get(m.id as string);
    let vestedPct = 0;
    let vestedShares = 0;
    let vestingTimeline: Array<{ eventDate: string; sharesVested: number; cumulativeVested: number; isCliff: boolean }> = [];

    if (sched) {
      try {
        vestingTimeline = calculateVestingSchedule({
          totalShares: Number(sched.total_shares),
          cliffMonths: Number(sched.cliff_months),
          vestMonths: Number(sched.vest_months),
          scheduleType: sched.schedule_type as "monthly" | "quarterly" | "annual",
          startDate: sched.start_date as string,
        });
        const pastEvents = vestingTimeline.filter((e) => e.eventDate <= today);
        vestedShares = pastEvents.length > 0
          ? pastEvents[pastEvents.length - 1].cumulativeVested
          : 0;
        vestedPct = Number(m.options_granted) > 0
          ? Math.round((vestedShares / Number(m.options_granted)) * 100)
          : 0;
      } catch {
        // ignore computation errors
      }
    }

    return {
      memberId: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      grantDate: sched?.start_date ?? m.join_date,
      shares: Number(m.options_granted),
      exercisePrice: sched ? null : null, // exercise price stored in schedule notes
      vestingMonths: sched ? Number(sched.vest_months) : null,
      cliffMonths: sched ? Number(sched.cliff_months) : null,
      scheduleType: sched?.schedule_type ?? null,
      vestedPct,
      vestedShares,
      unvestedShares: Number(m.options_granted) - vestedShares,
      valueAud: pps > 0 ? Math.round(Number(m.options_granted) * pps) : null,
      vestedValueAud: pps > 0 ? Math.round(vestedShares * pps) : null,
      scheduleId: sched?.id ?? null,
    };
  });

  // Pool summary
  const totalGranted = (members ?? []).reduce((s, m) => s + Number(m.options_granted), 0);
  const poolSize = pool ? Number(pool.pool_size_shares) : 0;
  const poolUtilizationPct = poolSize > 0 ? Math.round((totalGranted / poolSize) * 100) : 0;
  const poolAvailable = Math.max(poolSize - totalGranted, 0);

  // Industry benchmarks (AU startup)
  const avgGrantSize = grants.length > 0
    ? Math.round(totalGranted / grants.length)
    : 0;

  const poolSummary = pool
    ? {
        poolId: pool.id,
        poolSize,
        totalGranted,
        available: poolAvailable,
        utilizationPct: poolUtilizationPct,
        schemeType: pool.scheme_type,
        auTaxConcession: pool.au_tax_concession,
        avgGrantSize,
        // Health indicators
        health: {
          utilization: poolUtilizationPct,
          utilizationStatus:
            poolUtilizationPct >= 95
              ? "critical"
              : poolUtilizationPct >= 80
              ? "warning"
              : "healthy",
          needsRefresh: poolUtilizationPct >= 95,
          refreshRecommended: poolAvailable < poolSize * 0.05, // below 5%
          industryBenchmarkGrantSize: 250000, // AU benchmark: ~250K options per key hire
          grantVsIndustry:
            avgGrantSize > 0
              ? avgGrantSize >= 250000
                ? "above_benchmark"
                : avgGrantSize >= 100000
                ? "at_benchmark"
                : "below_benchmark"
              : null,
        },
      }
    : null;

  return NextResponse.json({
    ok: true,
    grants,
    poolSummary,
    plan: {
      id: plan.id,
      startupName: plan.startup_name,
      totalShares: Number(plan.total_shares),
      preMoney: plan.pre_money_valuation ? Number(plan.pre_money_valuation) : null,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/equity/grants — Create a new ESOP grant
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  let body: {
    planId: string;
    memberId?: string;
    // If no memberId, create member:
    memberName?: string;
    memberEmail?: string;
    memberRole?: string;
    // Grant details:
    grantDate: string;
    shares: number;
    exercisePrice?: number;
    vestingMonths: number;
    cliffMonths: number;
    scheduleType?: "monthly" | "quarterly" | "annual";
    notes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.planId || !body.grantDate || !body.shares || !body.vestingMonths) {
    return NextResponse.json(
      { ok: false, error: "planId, grantDate, shares, and vestingMonths are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin()!;

  // Verify plan ownership
  const { data: plan } = await supabase
    .from("equity_plans")
    .select("id, user_id, total_shares")
    .eq("id", body.planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ ok: false, error: "Plan not found" }, { status: 404 });
  }

  // ── Create or retrieve member ─────────────────────────────────────────
  let memberId = body.memberId;

  if (!memberId) {
    if (!body.memberName) {
      return NextResponse.json(
        { ok: false, error: "memberName required when memberId not provided" },
        { status: 400 }
      );
    }

    const { data: newMember, error: memberErr } = await supabase
      .from("equity_members")
      .insert({
        equity_plan_id: body.planId,
        name: body.memberName,
        email: body.memberEmail ?? null,
        role: body.memberRole ?? "option_holder",
        share_class: "Ordinary",
        shares_issued: 0,
        options_granted: body.shares,
        join_date: body.grantDate,
        notes: body.notes ?? null,
      })
      .select("id")
      .single();

    if (memberErr || !newMember) {
      return NextResponse.json(
        { ok: false, error: memberErr?.message ?? "Failed to create member" },
        { status: 500 }
      );
    }
    memberId = newMember.id as string;
  } else {
    // Update existing member's options_granted
    const { data: existing } = await supabase
      .from("equity_members")
      .select("id, options_granted")
      .eq("id", memberId)
      .eq("equity_plan_id", body.planId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Member not found in plan" }, { status: 404 });
    }

    await supabase
      .from("equity_members")
      .update({
        options_granted: Number(existing.options_granted ?? 0) + body.shares,
      })
      .eq("id", memberId);
  }

  // ── Create vesting schedule ────────────────────────────────────────────
  const scheduleType = body.scheduleType ?? "monthly";
  const { data: schedule, error: schedErr } = await supabase
    .from("equity_vesting_schedules")
    .insert({
      equity_plan_id: body.planId,
      member_id: memberId,
      total_shares: body.shares,
      cliff_months: body.cliffMonths ?? 12,
      vest_months: body.vestingMonths,
      schedule_type: scheduleType,
      start_date: body.grantDate,
      accelerate_on_exit: false,
      milestones: [],
    })
    .select("*")
    .single();

  if (schedErr || !schedule) {
    return NextResponse.json(
      { ok: false, error: schedErr?.message ?? "Failed to create vesting schedule" },
      { status: 500 }
    );
  }

  // ── Compute vesting timeline ───────────────────────────────────────────
  let vestingTimeline: Array<{ eventDate: string; sharesVested: number; cumulativeVested: number; isCliff: boolean }> = [];
  try {
    vestingTimeline = calculateVestingSchedule({
      totalShares: body.shares,
      cliffMonths: body.cliffMonths ?? 12,
      vestMonths: body.vestingMonths,
      scheduleType,
      startDate: body.grantDate,
    });

    // Persist vesting events
    if (vestingTimeline.length > 0) {
      const events = vestingTimeline.map((e) => ({
        vesting_schedule_id: schedule.id,
        event_date: e.eventDate,
        shares_vested: e.sharesVested,
        cumulative_vested: e.cumulativeVested,
        is_cliff: e.isCliff,
      }));
      await supabase.from("equity_vesting_events").insert(events);
    }
  } catch (err) {
    console.error("Vesting timeline computation failed:", err);
  }

  // ── Update ESOP pool allocated ─────────────────────────────────────────
  // We track allocation by summing options_granted on members, not a separate column
  // This is computed on read in the GET endpoint

  return NextResponse.json({
    ok: true,
    grant: {
      memberId,
      scheduleId: schedule.id,
      planId: body.planId,
      grantDate: body.grantDate,
      shares: body.shares,
      vestingMonths: body.vestingMonths,
      cliffMonths: body.cliffMonths ?? 12,
      scheduleType,
    },
    vestingTimeline,
    timelineEvents: vestingTimeline.length,
  });
}
