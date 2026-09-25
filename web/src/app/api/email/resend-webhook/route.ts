// POST /api/email/resend-webhook — G34-BT2 EM04.
//
// Resend (Svix-signed) delivery events → hard-bounce / complaint suppression
// in email_preferences (lib/email-webhook.ts). Configure in the Resend
// dashboard: endpoint https://blockid.au/api/email/resend-webhook, events
// `email.bounced` + `email.complained`, and set RESEND_WEBHOOK_SECRET to the
// endpoint's `whsec_…` signing secret. Without the secret the route refuses
// every call (503) — an unsigned request can never suppress an address.

import { NextResponse } from "next/server";
import { handleResendEvent, verifySvixSignature, type ResendEvent } from "@/lib/email-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  if (!secret) {
    return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }
  const verified = verifySvixSignature(secret, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  }, body);
  if (!verified) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }
  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const result = await handleResendEvent(event);
  return NextResponse.json({ ok: true, type: event.type ?? null, ...result });
}
