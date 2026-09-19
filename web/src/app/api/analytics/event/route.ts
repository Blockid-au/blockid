// POST /api/analytics/event — G16-A client → server funnel-event ingest.
//
// The browser tells the server that a funnel surface rendered or a CTA was
// clicked (`paywall_view`, `checkout`, `report_view`, `dashboard_view`,
// `share_link_open`); the server decides everything that matters:
//
//   * identity: the blockid_session cookie (getCurrentUser) — the client can
//     never name a user_id. An anonymous browser may only send the two
//     public-surface events (ANON_EMITTABLE_EVENTS: the /tbr/* paywall and a
//     share-link open) and must carry a session id (blockid_anon cookie or
//     body.session_id);
//   * `qa`: set from the account e-mail (qa-live-*), never from the body —
//     `user_id` / `qa` keys a client tries to send are stripped;
//   * PII: trackEvent() rejects e-mail / phone / card-looking values;
//   * rate: 60 events / minute per user (or per session / IP when anonymous)
//     through lib/rate-limit.ts.
//
// Body: `{ name, params?, session_id?, consent_granted? }` — one event per
// call (the paywall fires once per render; `navigator.sendBeacon` / fetch
// keepalive both fit). Reply `{ ok: true }` / `{ ok: false, error }`.
//
// Not wrapped by apiRoute(): telemetry, no state of record — allow-listed in
// src/lib/audit/allowlist.json beside /api/analytics/ingest.
//
// Lane B calls this with:
//   fetch("/api/analytics/event", { method: "POST", keepalive: true,
//     headers: { "content-type": "application/json" },
//     body: JSON.stringify({ name: "paywall_view",
//       params: { surface: "tbr_unlock_rail", sku, amount_cents, project_id } }) })

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { readAnonKey } from "@/lib/analyses/anon-key";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  ANON_EMITTABLE_EVENTS,
  isClientEmittableEvent,
  qaFlag,
  trackEvent,
  type AnalyticsEvent,
} from "@/lib/analytics/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Params keys only the server may set. */
const SERVER_ONLY_KEYS = new Set(["user_id", "qa", "email", "session_id"]);

const BodySchema = z.object({
  name: z.string().min(1).max(64),
  params: z.record(z.string(), z.unknown()).default({}),
  session_id: z.string().min(8).max(128).optional(),
  consent_granted: z.boolean().default(false),
});

export const RATE_MAX = 60;
export const RATE_WINDOW_MS = 60_000;

function stripServerKeys(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (SERVER_ONLY_KEYS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const { name, params, session_id, consent_granted } = parsed.data;
  if (!isClientEmittableEvent(name)) {
    return NextResponse.json({ ok: false, error: "event_not_allowed" }, { status: 400 });
  }

  let user: { id: string; email: string | null } | null = null;
  try {
    const u = await getCurrentUser();
    if (u) user = { id: u.id, email: u.email ?? null };
  } catch {
    user = null;
  }
  const anonKey = user ? null : await readAnonKey();
  const sessionId = session_id ?? anonKey ?? null;

  if (!user) {
    if (!ANON_EMITTABLE_EVENTS.includes(name)) {
      return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "session_required" }, { status: 400 });
    }
  }

  const limited = enforceRateLimit("analytics-event", user?.id ?? sessionId, request, RATE_MAX, RATE_WINDOW_MS);
  if (limited) return limited;

  const cleaned = { ...stripServerKeys(params), ...qaFlag(user?.email) };
  const result = await trackEvent(
    name,
    cleaned as AnalyticsEvent["params"],
    { userId: user?.id ?? null, sessionId, source: "client", consentGranted: consent_granted },
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason ?? "rejected" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
