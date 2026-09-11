// GET|POST /api/cron/evaluator-progress-weekly
//
// T0273 (G12 sprint S4) — weekly Evaluator Progress Radar. Sunday 23:30 UTC
// (Monday 09:30 AEST), 30 minutes after the founder digest, so an evaluator
// who is also a founder gets two distinct emails, not one interleaved batch.
//
// Audience = every user who
//   1. holds ≥ 1 `evaluations` row (T0270) — the radar keys on
//      `evaluations.project_id`, never the ticker `watchlist` (G12-10);
//   2. is an evaluator persona: `app_users.account_type` in
//      EVALUATOR_ACCOUNT_TYPES, or `segment` in investor_angel / investor_vc /
//      advisor / accelerator;
//   3. has the `money_radar` feature (plan flag, per-user grant or the timed
//      `money_radar_until` layer — resolved by getEntitlements()).
//
// Per user: buildEvaluatorProgress → skip silent weeks (`digest_ready`
// false) → claim the `evaluator_progress_sends (user_id, period_start)`
// slot BEFORE sending (dupe → skipped) → in-app `weekly_next_step`
// notification → email if canSendEmail(email, "money_radar") → on a send
// failure release the slot so the next tick can retry.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`. `?dry=1` computes everything,
// claims nothing, writes nothing, sends nothing, and returns the per-user
// summaries. cron-runner.sh POSTs; GET is kept for manual checks.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getEntitlements } from "@/lib/entitlements";
import { sendEmail } from "@/lib/email";
import { canSendEmail, ensureEmailPreferences, getUnsubscribeUrl } from "@/lib/email-preferences";
import {
  buildEvaluatorProgress,
  claimProgressSend,
  isEvaluatorPersona,
  notifyEvaluatorProgress,
  progressHeadline,
  releaseProgressSend,
  type EvaluatorProgress,
} from "@/lib/evaluations/progress-radar";
import { renderEvaluatorProgressEmail } from "@/lib/evaluations/progress-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 240_000;

interface AudienceRow {
  id: string;
  email: string | null;
  display_name: string | null;
  plan: string | null;
  account_type: string | null;
  segment: string | null;
}

function isDry(request: Request): boolean {
  try {
    const v = new URL(request.url).searchParams.get("dry");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

interface UserSummary {
  user_id: string;
  startups: number;
  moved: number;
  deadlines: number;
  new_matches: number;
  digest_ready: boolean;
  subject?: string;
  outcome: "sent" | "would_send" | "skipped_empty" | "skipped_dupe" | "skipped_unsubscribed" | "no_email" | "failed";
}

export async function GET(request: Request) {
  // S8-C (2026-09-11): constant-time compare of the bearer secret.
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  const dryRun = isDry(request);
  const startedAt = Date.now();
  const now = new Date();

  // 1. Who holds evaluations.
  const { data: evalRows, error: evalErr } = await supabase
    .from("evaluations")
    .select("evaluator_user_id")
    .limit(10_000);
  if (evalErr) {
    // 42P01 = migration 0314 not applied → nothing to do, not a failure.
    if ((evalErr as { code?: string }).code === "42P01") {
      return NextResponse.json({ ok: true, dryRun, audience: 0, sent: 0, reason: "evaluations_table_missing" });
    }
    return NextResponse.json({ ok: false, error: "evaluations_query_failed", detail: evalErr.message }, { status: 500 });
  }
  const holderIds = Array.from(
    new Set(((evalRows ?? []) as Array<{ evaluator_user_id: string }>).map((r) => r.evaluator_user_id).filter(Boolean)),
  );

  // 2. Persona filter.
  const audience: AudienceRow[] = [];
  for (let i = 0; i < holderIds.length; i += 500) {
    const { data } = await supabase
      .from("app_users")
      .select("id, email, display_name, plan, account_type, segment")
      .in("id", holderIds.slice(i, i + 500));
    for (const u of (data ?? []) as AudienceRow[]) {
      if (isEvaluatorPersona(u)) audience.push(u);
    }
  }

  const summaries: UserSummary[] = [];
  let sent = 0;
  let skippedEmpty = 0;
  let skippedDupe = 0;
  let skippedNoRadar = 0;
  let skippedUnsub = 0;
  let failures = 0;
  let budgetExceeded = false;

  for (const u of audience) {
    if (Date.now() - startedAt > BUDGET_MS) {
      budgetExceeded = true;
      break;
    }
    // Tracked outside the try so a throw after the claim (notify /
    // canSendEmail / render / send) releases the slot (review #13) — the
    // in-app row's dedupe key stops a duplicate on the retry.
    let claimed: EvaluatorProgress | null = null;
    try {
      // 3. money_radar entitlement (plan + grants + timed layer).
      const flags = await getEntitlements(u.plan, u.id);
      if (!flags.includes("money_radar")) {
        skippedNoRadar++;
        continue;
      }

      const progress: EvaluatorProgress = await buildEvaluatorProgress({ userId: u.id, now });
      const base = {
        user_id: u.id,
        startups: progress.items.length,
        moved: progress.movers.length,
        deadlines: progress.deadlines.length,
        new_matches: progress.newMatches,
        digest_ready: progress.digest_ready,
      };
      if (!progress.digest_ready) {
        skippedEmpty++;
        summaries.push({ ...base, outcome: "skipped_empty" });
        continue;
      }

      if (dryRun) {
        summaries.push({ ...base, subject: progressHeadline(progress), outcome: "would_send" });
        continue;
      }

      // 4. Claim the slot before any side effect.
      const claim = await claimProgressSend(progress);
      if (claim === "dupe") {
        skippedDupe++;
        summaries.push({ ...base, outcome: "skipped_dupe" });
        continue;
      }
      if (claim === "error") {
        failures++;
        summaries.push({ ...base, outcome: "failed" });
        continue;
      }
      claimed = progress;

      // 5. In-app row (free for every rung; dedupe-keyed on the period).
      await notifyEvaluatorProgress(progress);

      // 6. Email — money_radar category, unsubscribe link per user.
      if (!u.email) {
        summaries.push({ ...base, outcome: "no_email" });
        continue;
      }
      const allowed = await canSendEmail(u.email, "money_radar");
      if (!allowed) {
        skippedUnsub++;
        summaries.push({ ...base, outcome: "skipped_unsubscribed" });
        continue;
      }
      const token = await ensureEmailPreferences(u.email);
      const unsubscribeUrl = token ? getUnsubscribeUrl(token, "money_radar") : undefined;
      const rendered = renderEvaluatorProgressEmail({ progress, displayName: u.display_name, unsubscribeUrl });
      const result = await sendEmail({
        to: u.email,
        subject: rendered.subject,
        html: rendered.html,
        unsubscribeUrl,
      });
      if (result.ok) {
        sent++;
        summaries.push({ ...base, subject: rendered.subject, outcome: "sent" });
      } else {
        failures++;
        summaries.push({ ...base, outcome: "failed" });
        // Release the slot so the next tick can retry (in-app row stays —
        // its dedupe key stops a duplicate).
        await releaseProgressSend(progress);
      }
    } catch (err) {
      failures++;
      summaries.push({ user_id: u.id, startups: 0, moved: 0, deadlines: 0, new_matches: 0, digest_ready: false, outcome: "failed" });
      console.warn("[evaluator-progress-weekly] tick failed for", u.id, err);
      if (claimed) {
        try {
          await releaseProgressSend(claimed);
        } catch (releaseErr) {
          console.warn("[evaluator-progress-weekly] release after failure failed for", u.id, releaseErr);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    holders: holderIds.length,
    audience: audience.length,
    sent,
    would_send: dryRun ? summaries.filter((s) => s.outcome === "would_send").length : 0,
    skipped_empty: skippedEmpty,
    skipped_dupe: skippedDupe,
    skipped_no_radar: skippedNoRadar,
    skipped_unsubscribed: skippedUnsub,
    failures,
    budget_exceeded: budgetExceeded,
    duration_ms: Date.now() - startedAt,
    ...(dryRun ? { users: summaries } : {}),
  });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
