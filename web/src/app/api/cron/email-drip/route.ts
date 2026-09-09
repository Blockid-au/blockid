// GET|POST /api/cron/email-drip
//
// CCSO onboarding drip worker. Each run, in order:
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
  dueDrips,
  expireStaleDrips,
  markFailed,
  markSent,
  renderDripBody,
  suppressDrip,
  type DripPayload,
} from "@/lib/email-drip";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 50;

async function handle(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  const now = new Date();
  // Expiry guard first — a stale row must never reach the transport. A dry
  // run reports what would expire without writing.
  const expired = dryRun ? 0 : await expireStaleDrips(now);
  const drips = await dueDrips(now, BATCH_LIMIT);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
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
