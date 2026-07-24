// /api/cron/trial-charge-warning — pre-charge email cron.
//
// Runs every hour (add to server crontab; not auto-wired). For every
// app_users row whose trial_end_at falls inside the warning window
// (default 48h ± 1h) and whose trial_warning_sent_at is NULL, sends
// the founder-facing pre-charge email and stamps trial_warning_sent_at
// so the next invocation is idempotent.
//
// Auth: Bearer CRON_SECRET (or x-cron-secret header) — matches sibling
// crons under /api/cron/**.
//
// This is the primary trigger for the pre-charge notification; the
// Stripe `customer.subscription.trial_will_end` webhook (fires at T-3d)
// is a redundant backup and drives a separate drip.

import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendTrialChargeWarning } from "@/lib/email";
import { getPlanCached } from "@/lib/plans-db";
import { TRIAL_WARNING_HOURS_BEFORE, formatAud } from "@/lib/plans/trial-copy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev
  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface Row {
  id: string;
  email: string;
  plan: string;
  trial_end_at: string | null;
}

interface Summary {
  ok: true;
  scanned: number;
  sent: number;
  skipped_no_plan: number;
  skipped_email_failed: number;
  errors: string[];
}

async function run(request: Request): Promise<NextResponse<Summary | { error: string }>> {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" } as { error: string }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  const warningHours = Number(
    url.searchParams.get("hours") ?? TRIAL_WARNING_HOURS_BEFORE,
  );

  // ±1h window around (trial_end_at - warningHours) so an hourly cron catches
  // every trial exactly once even with drift.
  const now = Date.now();
  const centre = now + warningHours * 60 * 60 * 1000;
  const lowerIso = new Date(centre - 60 * 60 * 1000).toISOString();
  const upperIso = new Date(centre + 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("app_users")
    .select("id, email, plan, trial_end_at")
    .not("trial_end_at", "is", null)
    .is("trial_warning_sent_at", null)
    .gte("trial_end_at", lowerIso)
    .lte("trial_end_at", upperIso);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  let sent = 0;
  let skippedNoPlan = 0;
  let skippedEmailFailed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const plan = await getPlanCached(row.plan);
    if (!plan) {
      skippedNoPlan += 1;
      continue;
    }
    const priceDisplay = formatAud(plan.price_aud_cents);
    const hoursUntilCharge = row.trial_end_at
      ? Math.max(1, (new Date(row.trial_end_at).getTime() - now) / (60 * 60 * 1000))
      : warningHours;

    try {
      const result = await sendTrialChargeWarning({
        to: row.email,
        planName: plan.name,
        priceDisplay,
        chargeDate: row.trial_end_at!,
        hoursUntilCharge,
      });
      if (!result.ok) {
        skippedEmailFailed += 1;
        errors.push(`${row.id}:${result.reason}`);
        continue;
      }
    } catch (err) {
      skippedEmailFailed += 1;
      errors.push(`${row.id}:${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    await supabase
      .from("app_users")
      .update({ trial_warning_sent_at: new Date().toISOString() })
      .eq("id", row.id);
    sent += 1;
  }

  const summary: Summary = {
    ok: true,
    scanned: rows.length,
    sent,
    skipped_no_plan: skippedNoPlan,
    skipped_email_failed: skippedEmailFailed,
    errors: errors.slice(0, 20),
  };
  return NextResponse.json(summary);
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
