// GET|POST /api/cron/email-drip
//
// CCSO onboarding drip worker — also sends the Money Radar deadline drips
// (`radar_t30/t14/t3`, `radar_status_changed`) that
// lib/funding/radar-drips.ts queues after the weekly sweep (T0246) and the
// activation nudges (`radar_setup`, `radar_setup_2`) the sweep itself
// queues for subscribers with no profile (S11-A); all of those ride the
// `money_radar` preference through the same canSendDrip gate.
// Each run, in order:
//
//   1. expireStaleDrips() — pending rows more than DRIP_EXPIRY_DAYS past
//      their scheduled_for become `expired` and are never sent. This runs
//      BEFORE any send, and is idempotent.
//   2. dueDrips() — pending, unsent, due rows, capped at 50/run.
//   3. For each row: check suppression (canSendEmail via canSendDrip)
//      BEFORE claiming, so an unsubscribed address does not burn its slot;
//      then claimDrip() — a conditional UPDATE ... WHERE sent_at IS NULL —
//      and only send when the claim is won. A retry claims nothing and
//      sends nothing.
//
// G34-BT4 additions, in the same pipeline:
//   * the batch is ordered by flow priority (T first, then re-run > evidence
//     > intake > quota > onboarding > digest > sunset — plan §9.1 EM03), so
//     when two C-class rows for one address fall due on the same tick the
//     global cap drops the lower-priority one, not whichever is older;
//   * quiet hours: a C-class row due outside weekdays 08:00–19:00
//     Australia/Sydney stays pending (counted `deferredQuiet`) for the next
//     open hour; T-class is exempt;
//   * lifecycle stop conditions (lib/lifecycle/stop-conditions.ts): a flow
//     whose goal is reached (evidence added, onboarding finished, re-run
//     started, purchase made, signed in again) is cancelled, not sent; an
//     unreadable goal check leaves the row pending.
//
// `?dry=1` walks the whole pipeline except expiry and the send itself and
// reports exactly which addresses would be mailed.
//
// Auth matches other cron endpoints: `Authorization: Bearer <CRON_SECRET>`.

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import {
  canSendDrip,
  claimDrip,
  dripCategory,
  dripEmailClass,
  dripFlow,
  dueDrips,
  expireStaleDrips,
  markFailed,
  markSent,
  renderDripBody,
  suppressDrip,
  tbrUnlockSuppression,
  type DripPayload,
} from "@/lib/email-drip";
import { emailSendChecklist } from "@/lib/email-preferences";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { campaignPriority } from "@/lib/lifecycle/campaigns";
import { isInCommercialSendWindow } from "@/lib/lifecycle/send-window";
import { lifecycleStopDecision } from "@/lib/lifecycle/stop-conditions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 50;

async function handle(request: Request): Promise<Response> {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  const now = new Date();
  // Expiry guard first — a stale row must never reach the transport. A dry
  // run reports what would expire without writing.
  const expired = dryRun ? 0 : await expireStaleDrips(now);
  const due = await dueDrips(now, BATCH_LIMIT);
  // Stable sort: priority first, then the worker's scheduled_for order.
  const drips = due
    .map((d, i) => ({ d, i, p: campaignPriority(d.campaign, dripEmailClass(d.campaign)) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.d);
  const inWindow = isInCommercialSendWindow(now);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;
  let deferredQuiet = 0;
  const failures: string[] = [];
  const wouldSend: string[] = [];
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(/\/$/, "");

  for (const drip of drips) {
    try {
      // Suppression BEFORE the claim: an opted-out address must not have
      // its row stamped sent_at, and must not consume a batch slot again.
      const allowed = await canSendDrip(drip.email, drip.campaign);
      if (!allowed) {
        if (!dryRun) {
          await suppressDrip(drip.id, `suppressed: ${dripCategory(drip.campaign)} opt-out`);
        }
        skipped++;
        continue;
      }

      // G34-BT2 EM03/EM04/EM05 — commercial campaigns also pass consent,
      // suppression and the global frequency cap BEFORE the claim. A loser
      // is dropped (cancelled), never queued; an unreadable log / preference
      // row (fail-closed) leaves the row pending for a later tick.
      const emailClass = dripEmailClass(drip.campaign);
      const flow = dripFlow(drip.campaign);
      // G34-BT4 quiet hours: C-class waits for the next open hour (no write).
      if (emailClass === "C" && !inWindow) {
        deferredQuiet++;
        continue;
      }
      if (emailClass === "C") {
        const check = await emailSendChecklist(drip.email, dripCategory(drip.campaign), undefined, { flow });
        if (!check.ok) {
          if (check.reason === "gate_unavailable") {
            deferred++;
          } else if (!dryRun) {
            await suppressDrip(drip.id, `suppressed: ${check.reason}${check.detail ? `:${check.detail}` : ""}`);
          }
          skipped++;
          continue;
        }
      }

      // G16-B: the A$3 unlock nudge is cancelled (not sent, not claimed)
      // once the founder has bought, the plan includes the report, or the
      // address is a QA account. Other campaigns pass straight through.
      // G34-BT4 — lifecycle stop conditions (goal reached → cancel;
      // unreadable → leave pending). Non-lifecycle campaigns answer `send`.
      const stop = await lifecycleStopDecision(drip);
      if (stop.action === "cancel") {
        if (!dryRun) await suppressDrip(drip.id, `stopped: ${stop.reason}`);
        skipped++;
        continue;
      }
      if (stop.action === "defer") {
        deferred++;
        skipped++;
        continue;
      }

      const unlockSkip = await tbrUnlockSuppression(drip);
      if (unlockSkip) {
        if (!dryRun) await suppressDrip(drip.id, unlockSkip);
        skipped++;
        continue;
      }

      if (dryRun) {
        wouldSend.push(`${drip.campaign}:${drip.email}`);
        continue;
      }

      // Once-only: zero rows matched means someone else already has it.
      const claimed = await claimDrip(drip.id);
      if (!claimed) {
        skipped++;
        continue;
      }

      const payload = (drip.payload ?? {}) as DripPayload;
      const rendered = renderDripBody(drip.campaign, drip.email, payload);
      const unsubscribeUrl = `${siteUrl}/unsubscribe?email=${encodeURIComponent(drip.email)}`;
      const result = await sendEmail({
        to: drip.email,
        subject: rendered.subject,
        html: rendered.html,
        unsubscribeUrl,
        emailClass,
        flow,
        template: drip.campaign,
        category: dripCategory(drip.campaign),
      });
      if (result.ok) {
        await markSent(drip.id);
        sent++;
      } else {
        await markFailed(drip.id, `send failed: ${result.reason}`);
        failed++;
        failures.push(`${drip.campaign}:${result.reason}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!dryRun) await markFailed(drip.id, msg);
      failed++;
      failures.push(`${drip.campaign}:${msg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    considered: drips.length,
    expired,
    sent,
    failed,
    skipped,
    deferred,
    deferredQuiet,
    cap: BATCH_LIMIT,
    failures: failures.slice(0, 5),
    wouldSend,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
