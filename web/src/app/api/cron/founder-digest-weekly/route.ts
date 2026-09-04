// POST /api/cron/founder-digest-weekly
//
// Wave 28A — weekly cron that emails every enrolled founder a summary of the
// past 7 days on their BlockID report: views, investor leads, SVI movement,
// and a top action recommendation.
//
// Enrolment: `email_preferences.digest_weekly = TRUE` (default), scoped to
// users whose email_preferences row is not globally unsubscribed AND whose
// weekly_reports flag is TRUE (belt-and-braces — a user who disabled weekly
// reports never wants a digest either).
//
// Idempotency: `founder_digest_sends UNIQUE (user_id, period_start)` — if the
// cron fires twice (retry, manual invocation), the second INSERT fails and
// the row is counted as skipped_dupe instead of double-sending.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`. POST-only so `curl` scrapes
// don't accidentally trigger sends.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { buildFounderDigest, type DigestPayload } from "@/lib/digest/weekly";
import { renderFounderDigestEmail } from "@/lib/digest/email-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PERIOD_DAYS = 7;

interface EnrolledRow {
  email: string;
  weekly_reports: boolean;
  unsubscribed_all: boolean;
  digest_weekly: boolean;
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1000);

  // Enrolment pool — anyone opted-in to digest_weekly + weekly_reports + not
  // globally unsubscribed. We select the raw preference row and resolve
  // user_id via app_users so the digest_sends idempotency key stays UUID.
  const { data: prefRows, error: prefErr } = await supabase
    .from("email_preferences")
    .select("email, weekly_reports, unsubscribed_all, digest_weekly")
    .eq("digest_weekly", true)
    .eq("weekly_reports", true)
    .eq("unsubscribed_all", false)
    .limit(10000);
  if (prefErr) {
    return NextResponse.json(
      { ok: false, error: "prefs_query_failed", detail: prefErr.message },
      { status: 500 },
    );
  }

  const prefs = (prefRows ?? []) as EnrolledRow[];
  let sent = 0;
  let skippedEmpty = 0;
  let skippedDupe = 0;
  let failures = 0;

  for (const pref of prefs) {
    try {
      // Resolve user_id (idempotency key + digest audience).
      const { data: user } = await supabase
        .from("app_users")
        .select("id")
        .eq("email", pref.email)
        .maybeSingle();
      const userId = (user?.id as string | undefined) ?? null;
      if (!userId) continue;

      const payload: DigestPayload | null = await buildFounderDigest(
        userId,
        periodStart,
        periodEnd,
      );
      if (!payload) {
        skippedEmpty++;
        continue;
      }

      // Claim the (user_id, period_start) slot BEFORE sending so a crash
      // between send + insert doesn't produce a double-send on the next tick.
      const { error: insErr } = await supabase.from("founder_digest_sends").insert({
        user_id: userId,
        project_id: payload.projectId,
        period_start: payload.periodStart,
        period_end: payload.periodEnd,
        payload,
      });
      if (insErr) {
        // UNIQUE (user_id, period_start) violation — already sent this week.
        skippedDupe++;
        continue;
      }

      const rendered = renderFounderDigestEmail(payload);
      const result = await sendEmail({
        to: pref.email,
        subject: rendered.subject,
        html: rendered.html,
      });
      if (result.ok) {
        sent++;
      } else {
        failures++;
        // Roll back the audit row so a retry can re-send. Best effort.
        await supabase
          .from("founder_digest_sends")
          .delete()
          .eq("user_id", userId)
          .eq("period_start", payload.periodStart);
      }
    } catch (err) {
      failures++;
      console.warn("[founder-digest-weekly] tick failed for", pref.email, err);
    }
  }

  return NextResponse.json({
    ok: true,
    enrolled: prefs.length,
    sent,
    skipped_empty: skippedEmpty,
    skipped_dupe: skippedDupe,
    failures,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
  });
}
