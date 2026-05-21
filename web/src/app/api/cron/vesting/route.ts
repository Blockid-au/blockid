import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  computeVestingTimeline,
  getCurrentVested,
  type VestingSchedule,
} from "@/lib/vesting";
import { sendVestingMilestone } from "@/lib/email";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/cron/vesting — Daily vesting cron
//
// For each active vesting schedule:
//   1. Compute current vested amount
//   2. Update vested_shares in DB
//   3. If 100% vested -> mark completed
//   4. If cliff reached today -> send notification
//   5. If monthly vest milestone -> log it
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  try {
    const now = new Date();
    let processed = 0;
    let completed = 0;
    let emailed = 0;

    // Fetch all active vesting schedules
    const { data: schedules, error: fetchError } = await supabase
      .from("vesting_schedules")
      .select("*")
      .eq("status", "active");

    if (fetchError) {
      console.error("[blockid:vesting-cron] fetch error", fetchError);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch schedules" },
        { status: 500 },
      );
    }

    for (const row of schedules ?? []) {
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

      const current = getCurrentVested(schedule);
      const previousVested = Number(row.vested_shares);
      const newVested = Math.round(current.vested * 100) / 100;

      // 1. Update vested_shares in DB
      const updates: Record<string, unknown> = {
        vested_shares: newVested,
        updated_at: now.toISOString(),
      };

      // 2. Check if vesting is complete
      if (current.percent >= 100) {
        updates.status = "completed";
        completed++;

        // Send completion email
        if (row.shareholder_email) {
          try {
            const result = await sendVestingMilestone({
              to: row.shareholder_email,
              shareholderName: row.shareholder_name,
              percentVested: 100,
              sharesVested: Number(row.total_shares),
              totalShares: Number(row.total_shares),
              milestoneType: "vesting_complete",
            });
            if (result.ok) emailed++;
          } catch (err) {
            console.warn("[blockid:vesting-cron] completion email failed", err);
          }
        }
      }

      // 3. Check if cliff was reached today
      const grantDate = new Date(row.grant_date);
      const cliffDate = new Date(grantDate);
      cliffDate.setMonth(cliffDate.getMonth() + row.cliff_months);

      const isCliffToday =
        cliffDate.getFullYear() === now.getFullYear() &&
        cliffDate.getMonth() === now.getMonth() &&
        cliffDate.getDate() === now.getDate();

      if (isCliffToday && row.shareholder_email) {
        try {
          const timeline = computeVestingTimeline(schedule);
          const cliffSnap = timeline.find((s) => s.isCliff);
          const result = await sendVestingMilestone({
            to: row.shareholder_email,
            shareholderName: row.shareholder_name,
            percentVested: cliffSnap?.percentVested ?? 0,
            sharesVested: cliffSnap?.cumulativeVested ?? 0,
            totalShares: Number(row.total_shares),
            milestoneType: "cliff_reached",
          });
          if (result.ok) emailed++;
        } catch (err) {
          console.warn("[blockid:vesting-cron] cliff email failed", err);
        }
      }

      // 4. Check if a monthly vest milestone occurred (vested amount increased)
      if (
        newVested > previousVested &&
        current.percent < 100 &&
        !isCliffToday
      ) {
        // Log monthly milestone
        console.log(
          `[blockid:vesting-cron] monthly vest: ${row.shareholder_name} — ` +
            `${previousVested} -> ${newVested} shares (${current.percent.toFixed(1)}%)`,
        );

        // Send monthly vest email
        if (row.shareholder_email) {
          try {
            const result = await sendVestingMilestone({
              to: row.shareholder_email,
              shareholderName: row.shareholder_name,
              percentVested: current.percent,
              sharesVested: newVested,
              totalShares: Number(row.total_shares),
              milestoneType: "monthly_vest",
            });
            if (result.ok) emailed++;
          } catch (err) {
            console.warn(
              "[blockid:vesting-cron] monthly vest email failed",
              err,
            );
          }
        }
      }

      // 5. Persist updates
      const { error: updateError } = await supabase
        .from("vesting_schedules")
        .update(updates)
        .eq("id", row.id);

      if (updateError) {
        console.error(
          `[blockid:vesting-cron] update failed for ${row.id}`,
          updateError,
        );
      } else {
        processed++;
      }
    }

    console.log(
      `[blockid:vesting-cron] done: processed=${processed}, completed=${completed}, emailed=${emailed}`,
    );

    return NextResponse.json({
      ok: true,
      processed,
      completed,
      emailed,
    });
  } catch (err) {
    console.error("[blockid:vesting-cron] cron failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
