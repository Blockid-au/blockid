// /api/cron/lifecycle-mailer — drip campaign mailer (T-0415).
//
// Runs every 15 minutes. Picks up to LIMIT rows from lifecycle_state
// whose next_send_at ≤ now(), renders the right template, sends via
// lib/email.sendEmail, and advances the state machine. Best-effort:
// mailer failures leave the row in place so the next tick retries;
// permanent errors mark next_send_at NULL so we don't hot-loop.

import { NextResponse } from "next/server";

import { advance, loadDue } from "@/lib/conversion/lifecycle";
import { renderLifecycleEmail } from "@/emails/lifecycle/render";
import { sendEmail } from "@/lib/email";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const LIMIT = 100;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://blockid.au";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed: if no secret is configured, refuse the request rather than
  // opening the endpoint to the world (env rotation / staging clone risk).
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const due = await loadDue(LIMIT);
  const results: Array<{ user: string; step: string; ok: boolean; reason?: string }> = [];

  for (const row of due) {
    const step = row.current_step;
    if (!step || step === "done") continue;

    const { data: user } = await supabase
      .from("app_users")
      .select("email, name, first_name")
      .eq("id", row.user_id)
      .maybeSingle();

    if (!user?.email) {
      // No address — mark step advanced so we don't retry every tick.
      await advance(row.user_id, step);
      results.push({ user: row.user_id, step, ok: false, reason: "no_email" });
      continue;
    }

    const { data: trial } = await supabase
      .from("subscription_trial_state")
      .select("trial_end, plan_id")
      .eq("user_id", row.user_id)
      .maybeSingle();

    const rendered = renderLifecycleEmail({
      step,
      firstName: user.first_name ?? user.name ?? null,
      trialEndsAt: trial?.trial_end ?? null,
      planLabel: trial?.plan_id ?? null,
      unsubscribeUrl: `${APP_URL}/account/unsubscribe?u=${encodeURIComponent(row.user_id)}`,
    });

    if (!rendered.subject) {
      await advance(row.user_id, step);
      continue;
    }

    const send = await sendEmail({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      unsubscribeUrl: `${APP_URL}/account/unsubscribe?u=${encodeURIComponent(row.user_id)}`,
    });

    if (send.ok) {
      const next = await advance(row.user_id, step);
      results.push({ user: row.user_id, step, ok: true, reason: `→${next}` });
    } else {
      // TODO(security-audit M-code-8): classify permanent bounces (SES
      // "Permanent", SMTP 550, mailbox suppression) and call
      // stopLifecycle(userId) so we don't retry a dead address every 15 min
      // (IP reputation risk). Until then, leave next_send_at in place and
      // let the cron retry with the same cadence.
      results.push({ user: row.user_id, step, ok: false, reason: "send_failed" });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
