// G16-B — tiny client → server funnel-event emitter.
//
// Posts `{ name, params }` to the ingest route lane A owns
// (`POST /api/analytics/event`, cookie-authenticated, allow-listed names,
// rate-limited; it stamps user_id / qa server-side). Fire-and-forget: every
// failure is swallowed — analytics must never break a founder surface — and
// `keepalive` lets the beacon survive a navigation to Stripe.
//
// Also pushes the same event onto the GA4 dataLayer through the existing
// client helper so the GA funnel sees it too. Event names are typed loosely
// here on purpose: `paywall_view` / `checkout` are defined in
// `lib/analytics/events.ts` by lane A; the merge reconciles the union.

export type FunnelClientEventName = "paywall_view" | "checkout";

export interface PaywallViewParams {
  surface: string;
  sku: string;
  amount_cents: number;
  project_id?: string | null;
}

export interface CheckoutClientParams {
  sku: string;
  amount_cents: number;
  project_id?: string | null;
}

export const CLIENT_EVENT_INGEST_PATH = "/api/analytics/event";

type FetchLike = (input: string, init?: RequestInit) => Promise<unknown>;

/** Strip null/undefined so the ingest schema sees only real values. */
function compact(params: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * Emit one funnel event from the browser. Returns the promise for tests;
 * callers may ignore it. Never throws, never rejects.
 */
export function emitClientEvent(
  name: FunnelClientEventName,
  params: PaywallViewParams | CheckoutClientParams,
  deps: { fetch?: FetchLike; dataLayer?: unknown[] | null } = {},
): Promise<void> {
  const body = JSON.stringify({ name, params: compact(params as unknown as Record<string, unknown>) });
  const dl = deps.dataLayer === undefined ? (typeof window !== "undefined" ? ((window as unknown as { dataLayer?: unknown[] }).dataLayer ??= []) : null) : deps.dataLayer;
  try {
    dl?.push({ event: name, ...compact(params as unknown as Record<string, unknown>) });
  } catch {
    /* analytics only */
  }
  const f: FetchLike | null = deps.fetch ?? (typeof fetch === "function" ? (fetch as unknown as FetchLike) : null);
  if (!f) return Promise.resolve();
  return f(CLIENT_EVENT_INGEST_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  })
    .then(() => undefined)
    .catch(() => undefined);
}
