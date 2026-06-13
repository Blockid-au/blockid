// POST /api/equity/calculate — pure equity calculations (no DB write).
//
// Body: { action: 'calculate_cap_table' | 'calculate_vesting' | 'calculate_dilution' | 'calculate_esop', data: {...} }
//
// Auth required. This endpoint is the calculation surface the workspace UI
// uses for interactive what-if modelling without touching equity_plans.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  calculateCapTable,
  calculateVestingSchedule,
  calculateDilution,
  calculateESOP,
  generateVestingTimeline,
} from "@/lib/equity/engine";

export const dynamic = "force-dynamic";

type Action =
  | "calculate_cap_table"
  | "calculate_vesting"
  | "calculate_dilution"
  | "calculate_esop";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  let body: { action?: Action; data?: Record<string, unknown> } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { action, data } = body;
  if (!action || !data) {
    return NextResponse.json({ ok: false, error: "action and data required" }, { status: 400 });
  }

  try {
    switch (action) {
      case "calculate_cap_table": {
        const { plan, members } = data as {
          plan: { totalShares: number; preMoneyValuation?: number | null };
          members: Parameters<typeof calculateCapTable>[1];
        };
        return NextResponse.json({ ok: true, rows: calculateCapTable(plan, members) });
      }
      case "calculate_vesting": {
        const input = data as unknown as Parameters<typeof calculateVestingSchedule>[0];
        const events = calculateVestingSchedule(input);
        return NextResponse.json({
          ok: true,
          events,
          timeline: generateVestingTimeline(events),
        });
      }
      case "calculate_dilution": {
        const { plan, round } = data as {
          plan: Parameters<typeof calculateDilution>[0];
          round: Parameters<typeof calculateDilution>[1];
        };
        return NextResponse.json({ ok: true, result: calculateDilution(plan, round) });
      }
      case "calculate_esop": {
        const { pool, totalShares, allocatedShares } = data as {
          pool: Parameters<typeof calculateESOP>[0];
          totalShares: number;
          allocatedShares?: number;
        };
        return NextResponse.json({
          ok: true,
          summary: calculateESOP(pool, totalShares, allocatedShares ?? 0),
        });
      }
      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Calculation failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
