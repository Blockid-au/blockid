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

export type FunnelClientEventName = "paywall_view" | "checkout" | "checkout_review_viewed" | "checkout_started";

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

/**
 * G25-D — the review step (`/checkout/review`) and its Pay click. `plan` is
 * the order id (plan id / `credits_<n>` / sku), `entry` the surface that
 * linked to the review (pricing_card, upgrade_modal, billing, …).
 */
export interface CheckoutReviewParams {
  plan: string;
  kind: "plan" | "pack" | "sku";
  interval: "monthly" | "annual" | "once";
  trial: boolean;
  entry: string;
  amount_cents: number;
}

export const CLIENT_EVENT_INGEST_PATH = "/api/analytics/event";

const ANON_SESSION_KEY = "blockid_review_sid";

/**
 * A per-browser session id for the anonymous `checkout_review_viewed` beacon
 * (the ingest route needs one when no account cookie is present). Kept in
 * sessionStorage so one tab = one actor; every storage failure → a fresh id.
 */
export function anonSessionId(storage: Pick<Storage, "getItem" | "setItem"> | null = typeof sessionStorage === "undefined" ? null : sessionStorage): string {
  const fresh = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  if (!storage) return fresh();
  try {
    const existing = storage.getItem(ANON_SESSION_KEY);
    if (existing && existing.length >= 8) return existing;
    const id = fresh();
    storage.setItem(ANON_SESSION_KEY, id);
    return id;
  } catch {
    return fresh();
  }
}

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
  params: PaywallViewParams | CheckoutClientParams | CheckoutReviewParams,
  deps: { fetch?: FetchLike; dataLayer?: unknown[] | null; sessionId?: string | null } = {},
): Promise<void> {
  const body = JSON.stringify({
    name,
    params: compact(params as unknown as Record<string, unknown>),
    ...(deps.sessionId ? { session_id: deps.sessionId } : {}),
  });
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
