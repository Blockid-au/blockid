// GET|POST /api/cron/email-drip
//
// CCSO onboarding drip worker. Walks pending email_drips rows whose
// scheduled_for <= now, renders each body, sends via the shared
// nodemailer/Resend transport (@/lib/email.sendEmail), and marks
// sent/failed. Capped at 50/run to protect the mail queue.
//
// Auth matches other cron endpoints: `Authorization: Bearer <CRON_SECRET>`.

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import {
  dueDrips,
  markFailed,
  markSent,
  renderDripBody,
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

  const now = new Date();
  const drips = await dueDrips(now, BATCH_LIMIT);

  let sent = 0;
  let failed = 0;
  const failures: string[] = [];
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(/\/$/, "");

  for (const drip of drips) {
    try {
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
      await markFailed(drip.id, msg);
      failed++;
      failures.push(`${drip.campaign}:${msg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    considered: drips.length,
    sent,
    failed,
    cap: BATCH_LIMIT,
    failures: failures.slice(0, 5),
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
