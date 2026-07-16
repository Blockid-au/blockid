// Server-side event emitter (W4).
//
// Two sinks per event:
//   1. Supabase `analytics_events` — source of truth, hash-idempotent on
//      event_id (unique index), later swept to BigQuery by the nightly cron.
//   2. GA4 Measurement Protocol — best-effort mirror to keep the GA4 UI
//      populated in real time.
//
// Batching: callers just `emitEvent()` and return. We accumulate up to
// FLUSH_MAX events or wait FLUSH_INTERVAL_MS (5s), whichever comes first,
// then flush both sinks. Failures are logged, not thrown — analytics must
// never break a user flow.

import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_MAX = 20;

export interface EmitEventInput {
  name: string;
  params: Record<string, unknown>;
  userId?: string | null;
  sessionId?: string | null;
  eventId?: string;
  consentGranted?: boolean;
  source?: string; // 'server' | 'client' | 'webhook:stripe' | ...
}

interface QueuedEvent {
  event_id: string;
  event_name: string;
  user_id: string | null;
  session_id: string | null;
  params: Record<string, unknown>;
  consent_granted: boolean;
  source: string;
}

// ── Module-scoped queue + flush timer ──────────────────────────────────

const queue: QueuedEvent[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let flushInFlight: Promise<void> | null = null;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
  // Node timers keep the event loop alive; unref so scripts can exit cleanly.
  if (typeof flushTimer.unref === "function") flushTimer.unref();
}

/**
 * Queue an event. Flushes eagerly when the batch fills; otherwise a 5s
 * timer sweeps the buffer. Never throws.
 */
export async function emitEvent(input: EmitEventInput): Promise<void> {
  const event: QueuedEvent = {
    event_id: input.eventId ?? randomUUID(),
    event_name: input.name,
    user_id: input.userId ?? null,
    session_id: input.sessionId ?? null,
    params: input.params ?? {},
    consent_granted: input.consentGranted ?? false,
    source: input.source ?? "server",
  };
  queue.push(event);
  if (queue.length >= FLUSH_MAX) {
    await flush();
  } else {
    scheduleFlush();
  }
}

/** Force-drain the queue. Callers who need synchronous delivery (tests,
 * shutdown hooks, single-shot cron jobs) can await this. */
export async function flush(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  flushInFlight = doFlush(batch).finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function doFlush(batch: QueuedEvent[]): Promise<void> {
  await Promise.allSettled([writeSupabase(batch), writeGa4(batch)]);
}

// ── Sink 1: Supabase analytics_events ──────────────────────────────────

async function writeSupabase(batch: QueuedEvent[]): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return; // dev fallback: no supabase, silently skip
  try {
    // Upsert on event_id so a retried batch is idempotent — matches the
    // analytics_events_event_id_uq index from migration 0077.
    const { error } = await admin
      .from("analytics_events")
      .upsert(
        batch.map((e) => ({
          event_id: e.event_id,
          event_name: e.event_name,
          user_id: e.user_id,
          session_id: e.session_id,
          params: e.params,
          consent_granted: e.consent_granted,
          source: e.source,
        })),
        { onConflict: "event_id", ignoreDuplicates: true },
      );
    if (error) console.warn("[analytics.server] supabase insert failed:", error.message);
  } catch (err) {
    console.warn("[analytics.server] supabase threw:", (err as Error).message);
  }
}

// ── Sink 2: GA4 Measurement Protocol ───────────────────────────────────

async function writeGa4(batch: QueuedEvent[]): Promise<void> {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (!measurementId || !apiSecret) return; // GA4 disabled

  // GA4 groups events under a single client_id, so group by session_id.
  const grouped = new Map<string, QueuedEvent[]>();
  for (const e of batch) {
    // Only forward consented events to GA4; server-generated system events
    // without a user still count as consented (server-source telemetry).
    if (!e.consent_granted && e.source === "client") continue;
    const key = e.session_id || e.user_id || `sys-${e.event_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  await Promise.allSettled(
    Array.from(grouped.entries()).map(async ([clientId, events]) => {
      const url = `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
      const body = {
        client_id: clientId,
        user_id: events[0].user_id ?? undefined,
        // MP hard-caps 25 events per payload; batches ≤20 always fit.
        events: events.map((e) => ({
          name: e.event_name,
          params: {
            ...e.params,
            engagement_time_msec: 1,
            session_id: e.session_id ?? undefined,
          },
        })),
      };
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          console.warn(`[analytics.server] GA4 MP ${res.status} ${res.statusText}`);
        }
      } catch (err) {
        console.warn("[analytics.server] GA4 MP fetch failed:", (err as Error).message);
      }
    }),
  );
}
