// POST /api/analytics/ingest — client-side event ingestion.
//
// The client SDK batches events and POSTs them here (rather than direct to
// GA4 MP) so we can (a) enforce per-user rate limits, (b) strip PII, and
// (c) mirror to Supabase in the same idempotent path the server-side
// emitter uses.

import { NextResponse } from "next/server";
import { z } from "zod";
import { emitEvent, flush } from "@/lib/analytics/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(?:\+?61|0)[2-478](?:[ -]?[0-9]){8}/;
const CC_RE = /\b(?:\d[ -]?){13,19}\b/;
const PII_KEYS = new Set(["email", "phone", "phone_number", "mobile", "credit_card", "cc", "ssn", "tfn", "password"]);

const EventSchema = z.object({
  event_id: z.string().uuid().optional(),
  name: z.string().min(1).max(64),
  params: z.record(z.string(), z.unknown()).default({}),
  session_id: z.string().max(128).optional(),
  ts: z.string().datetime().optional(),
  consent_granted: z.boolean().default(false),
});

const PayloadSchema = z.object({
  events: z.array(EventSchema).min(1).max(50),
});

function detectPii(params: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(params)) {
    if (PII_KEYS.has(k.toLowerCase())) return `pii-key:${k}`;
    if (typeof v === "string") {
      if (EMAIL_RE.test(v)) return `pii-email:${k}`;
      if (PHONE_RE.test(v)) return `pii-phone:${k}`;
      if (CC_RE.test(v)) return `pii-cc:${k}`;
    }
  }
  return null;
}

async function resolveUserId(request: Request): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const auth = request.headers.get("authorization");
  const token = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;
  if (!token) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  // 100 events/min per identity (userId or IP)
  const limited = enforceRateLimit("analytics-ingest", userId, request, 100, 60_000);
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let accepted = 0;
  let rejected = 0;
  const rejections: Array<{ name: string; reason: string }> = [];

  for (const evt of parsed.data.events) {
    const leak = detectPii(evt.params);
    if (leak) {
      rejected += 1;
      rejections.push({ name: evt.name, reason: leak });
      continue;
    }
    await emitEvent({
      name: evt.name,
      params: evt.params,
      userId,
      sessionId: evt.session_id ?? null,
      eventId: evt.event_id,
      consentGranted: evt.consent_granted,
      source: "client",
    });
    accepted += 1;
  }

  // Ingest-path always flushes so the client can retry lost batches with
  // the same event_id and get idempotent behaviour.
  await flush();

  return NextResponse.json({ ok: true, accepted, rejected, rejections });
}
