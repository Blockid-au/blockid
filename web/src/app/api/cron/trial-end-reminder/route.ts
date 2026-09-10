// /api/cron/trial-end-reminder — T-3d trial-ending nudge.
//
// W7b: finds subscription_trial_state rows where trial_end is roughly 3
// days out (window: now+3d → now+3d+1h) and lifecycle_state.history does
// not already contain a "trial_reminder_t3d" event. Sends an email via
// lib/email, best-effort Telegram ping, then appends the event to
// lifecycle_state.history.
//
// Every trial on this platform is card-required (founder + evaluator alike,
// D1 2026-09-10), so the copy is "your card will be charged A$X on <date>;
// cancel any time before then" — never "add a payment method / downgrade to
// free" (G12-6). Plan name + price resolve from the plans table; evaluator
// rungs show their public names (Scout / Firm / Program).
//
// Auth: x-cron-secret header must match CRON_SECRET (or Authorization
// Bearer). Schedule: hourly.

import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { sendTelegram } from "@/lib/telegram";
import { redactPii } from "@/lib/log-redact";
import { renderReminder, reminderSubject, resolvePlanDisplay } from "./reminder-copy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const REMINDER_KEY = "trial_reminder_t3d";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // dev: no secret configured
  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface HistoryEntry {
  event?: string;
  at?: string;
  [k: string]: unknown;
}

interface TrialRow {
  user_id: string;
  trial_end: string | null;
  plan_id: string | null;
  status: string | null;
}

// The cron-runner sends POST requests; export POST so the Node.js runtime
// (which enforces strict method matching unlike the default edge runtime)
// does not return 405 and cause the runner to retry-and-fail every tick.
export const POST = GET;

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 503 });
  }

  const now = Date.now();
  const windowStart = new Date(now + 3 * 86_400_000).toISOString();
  const windowEnd = new Date(now + 3 * 86_400_000 + 60 * 60_000).toISOString();

  const { data: candidates, error } = await supabase
    .from("subscription_trial_state")
    .select("user_id, trial_end, plan_id, status")
    .in("status", ["trialing", "active"])
    .gte("trial_end", windowStart)
    .lt("trial_end", windowEnd);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (candidates ?? []) as TrialRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, count: 0, skipped: 0 });
  }

  const userIds = rows.map((r) => r.user_id);
  const [{ data: users }, { data: lifecycle }] = await Promise.all([
    supabase.from("app_users").select("id, email, display_name").in("id", userIds),
    supabase.from("lifecycle_state").select("user_id, history").in("user_id", userIds),
  ]);

  const userById = new Map<string, { email: string; display_name: string | null }>();
  for (const u of (users ?? []) as { id: string; email: string; display_name: string | null }[]) {
    userById.set(u.id, { email: u.email, display_name: u.display_name });
  }
  const historyById = new Map<string, HistoryEntry[]>();
  for (const l of (lifecycle ?? []) as { user_id: string; history: unknown }[]) {
    historyById.set(l.user_id, Array.isArray(l.history) ? (l.history as HistoryEntry[]) : []);
  }

  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    const history = historyById.get(row.user_id) ?? [];
    if (history.some((h) => h?.event === REMINDER_KEY)) {
      skipped += 1;
      continue;
    }
    const user = userById.get(row.user_id);
    if (!user?.email) {
      skipped += 1;
      continue;
    }

    const trialEndFmt = row.trial_end
      ? new Date(row.trial_end).toLocaleDateString("en-AU", {
          weekday: "long",
          day: "numeric",
          month: "short",
        })
      : "in 3 days";

    const plan = await resolvePlanDisplay(row.plan_id);
    const subject = reminderSubject(plan, trialEndFmt);
    const html = renderReminder({
      name: user.display_name ?? "there",
      trialEndFmt,
      planName: plan.name,
      price: plan.price,
    });

    const result = await sendEmail({ to: user.email, subject, html }).catch((err: unknown) => {
      console.error("[cron:trial-end-reminder] email failed", err);
      return { ok: false } as const;
    });

    if (!result?.ok) {
      // Fallback log so we can retry next hour without appending to history.
      console.warn("[cron:trial-end-reminder] email not delivered", redactPii(user.email));
      skipped += 1;
      continue;
    }

    // Best-effort Telegram ping — don't gate on success.
    sendTelegram(
      `⏰ Trial T-3d reminder → ${user.email} (plan ${row.plan_id ?? "?"})`,
    ).catch(() => {});

    const newEntry: HistoryEntry = {
      event: REMINDER_KEY,
      at: new Date().toISOString(),
      trial_end: row.trial_end,
    };
    const merged = [...history, newEntry];

    const { error: upsertError } = await supabase
      .from("lifecycle_state")
      .upsert(
        {
          user_id: row.user_id,
          current_step: REMINDER_KEY,
          history: merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (upsertError) {
      console.error("[cron:trial-end-reminder] lifecycle upsert failed", upsertError);
    }

    sent += 1;
  }

  return NextResponse.json({ ok: true, count: sent, skipped });
}
