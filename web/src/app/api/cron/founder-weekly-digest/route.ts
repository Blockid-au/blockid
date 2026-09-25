// GET /api/cron/founder-weekly-digest
//
// P7a follow-up — docs/plans/atlassian-standard-mapping-goal.md §P7 exit
//   criteria: "digest section 'Your investor readiness this week' renders
//   {score band, delta vs last week, single next action, top-3 missing}".
//
// Weekly digest for active founders. For each founder active in the last
// 30 days:
//   1. Load their active project + phase progress + latest SVI + data-room
//      rows + evidence + compliance status (same loaders the
//      /api/nudge/next-steps route uses).
//   2. Call computeNextSteps() to derive phase / next_action / missing /
//      readiness score.
//   3. Fetch the previous svi_readiness_snapshots row for this founder
//      (before now) to compute a score delta + band-direction summary.
//   4. Persist the fresh snapshot (source='digest') so next week's delta
//      has a baseline.
//   5. Render the email via buildFounderDigest() and send it (honouring
//      the founder's email_preferences.weekly_reports flag).
//
// Auth: shared CRON_SECRET Bearer pattern.
// Kill switch: env FOUNDER_DIGEST=off short-circuits.
// Query params:
//   - skip_email=1 → dry-run (compute rows + subjects, DO NOT send +
//     DO NOT persist snapshots)

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { buildFounderDigest } from "@/lib/email/founder-digest";
import { buildNudgeFor, type FounderRow } from "@/lib/nudge/load-founder-nudge";
import {
  computeReadinessDelta,
  fetchLatestReadinessSnapshot,
  toSnapshotRow,
  writeReadinessSnapshot,
} from "@/lib/nudge/readiness-snapshots";
import {
  canSendEmail,
  ensureEmailPreferences,
  getUnsubscribeUrl,
} from "@/lib/email-preferences";
import { isCronAuthorised } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FOUNDER_ACCOUNT_TYPES = ["founder"] as const;
const LAST_LOGIN_WINDOW_DAYS = 30;
const DASHBOARD_URL = "https://blockid.au/dashboard";

interface DryRunSummary {
  founder_id: string;
  email: string;
  phase: string;
  readiness: number;
  band: string;
  band_direction: string;
  missing_count: number;
  subject: string;
}

export async function GET(req: Request): Promise<NextResponse> {
  if (process.env.FOUNDER_DIGEST === "off") {
    return NextResponse.json({ ok: true, disabled: true });
  }

  if (!isCronAuthorised(req)) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, reason: "not_configured" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const skipEmail = url.searchParams.get("skip_email") === "1";

  const cutoff = new Date(
    Date.now() - LAST_LOGIN_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: foundersData, error: foundersErr } = await supabase
    .from("app_users")
    .select("id, email, display_name")
    .in("account_type", FOUNDER_ACCOUNT_TYPES as unknown as string[])
    .gte("last_login_at", cutoff);

  if (foundersErr) {
    return NextResponse.json(
      {
        ok: false,
        reason: "founders_query_failed",
        error: foundersErr.message,
      },
      { status: 500 },
    );
  }
  const founders = (foundersData ?? []) as FounderRow[];

  if (founders.length === 0) {
    return NextResponse.json({ ok: true, founder_count: 0, emailed: 0 });
  }

  const dryRun: DryRunSummary[] = [];
  let emailed = 0;
  let failures = 0;
  const nowIso = new Date().toISOString();

  for (const founder of founders) {
    if (!founder.email) continue;

    try {
      const nudge = await buildNudgeFor(supabase, founder);

      // Previous snapshot for delta — always fetched BEFORE we persist the
      // fresh one below so the "before" cutoff still catches it.
      const previous = await fetchLatestReadinessSnapshot(supabase, {
        userId: founder.id,
        projectId: nudge.projectId,
        before: nowIso,
      });

      const snapshotRow = toSnapshotRow(nudge.result, {
        userId: founder.id,
        projectId: nudge.projectId,
        source: "digest",
      });
      const delta = computeReadinessDelta(snapshotRow, previous);

      const name = founder.display_name || founder.email.split("@")[0];
      const digest = buildFounderDigest({
        name,
        phaseSlug: nudge.result.current_phase.slug,
        phaseLabel: nudge.result.current_phase.label,
        readinessScore: snapshotRow.overall_score,
        band: snapshotRow.band,
        deltaSummary: delta.summary,
        bandDirection: delta.band_direction,
        nextAction:
          nudge.result.next_action.category === "phase_advance" &&
          nudge.result.missing.length === 0
            ? null
            : nudge.result.next_action,
        missingTop3: snapshotRow.missing_top3,
        dashboardUrl: DASHBOARD_URL,
        readinessByPhase: nudge.result.readiness_by_phase,
        previousReadinessByPhase:
          (previous?.readiness_by_phase as
            | typeof nudge.result.readiness_by_phase
            | undefined) ?? undefined,
      });

      if (skipEmail) {
        dryRun.push({
          founder_id: founder.id,
          email: founder.email,
          phase: nudge.result.current_phase.slug,
          readiness: snapshotRow.overall_score,
          band: snapshotRow.band,
          band_direction: delta.band_direction,
          missing_count: snapshotRow.missing_top3.length,
          subject: digest.subject,
        });
        continue;
      }

      // Honour weekly_reports opt-out (per email_preferences.ts).
      const allowed = await canSendEmail(founder.email, "weekly_reports");
      if (!allowed) continue;

      let unsubscribeUrl: string | undefined;
      try {
        const token = await ensureEmailPreferences(founder.email);
        unsubscribeUrl = getUnsubscribeUrl(token, "weekly_reports");
      } catch (err) {
        console.warn(
          "[founder-weekly-digest] unsubscribe url prep failed",
          founder.email,
          err,
        );
      }

      // Re-render with the unsubscribe link now that we have it.
      const digestForSend = unsubscribeUrl
        ? buildFounderDigest({
            name,
            phaseSlug: nudge.result.current_phase.slug,
            phaseLabel: nudge.result.current_phase.label,
            readinessScore: snapshotRow.overall_score,
            band: snapshotRow.band,
            deltaSummary: delta.summary,
            bandDirection: delta.band_direction,
            nextAction:
              nudge.result.next_action.category === "phase_advance" &&
              nudge.result.missing.length === 0
                ? null
                : nudge.result.next_action,
            missingTop3: snapshotRow.missing_top3,
            dashboardUrl: DASHBOARD_URL,
            readinessByPhase: nudge.result.readiness_by_phase,
        previousReadinessByPhase:
          (previous?.readiness_by_phase as
            | typeof nudge.result.readiness_by_phase
            | undefined) ?? undefined,
            unsubscribeUrl,
          })
        : digest;

      const res = await sendEmail({
        to: founder.email,
        subject: digestForSend.subject,
        html: digestForSend.html,
        unsubscribeUrl,
        // G34-BT2 EM03 — commercial: consent + suppression + global cap (fail-closed) in sendEmail.
        emailClass: "C",
        flow: "founder-digest",
        template: "founder_weekly_digest",
        category: "weekly_reports",
      });
      if (res && (res as { ok?: boolean }).ok !== false) {
        emailed++;
        // Persist the fresh snapshot so next week's delta anchors here.
        await writeReadinessSnapshot(supabase, snapshotRow);
      } else {
        failures++;
      }
    } catch (err) {
      failures++;
      console.warn(
        "[founder-weekly-digest] tick failed for",
        founder.email,
        err,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    founder_count: founders.length,
    emailed,
    failures,
    dry_run: skipEmail ? dryRun : undefined,
  });
}

// cron-runner.sh sends POST. Without this the route answers 405 and the job
// is dead — silently, because a 405 body is empty and the health log records
// an empty detail. Five scheduled jobs were failing this way, including
// dunning-retry (failed-payment retries) and refresh-sector-benchmarks.
// The GET handler is CRON_SECRET-guarded, so this adds no new access.
export { GET as POST };
