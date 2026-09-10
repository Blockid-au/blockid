// Dashboard widget layout — pure helpers shared by the client grid
// (components/dashboard/widget-grid.tsx) and the server route
// (app/api/dashboard/layout/route.ts). No "use client", no "server-only":
// this module must be importable from both sides and from vitest without a
// DOM.
//
// Persisted shape (app_users.dashboard_layout, migration 0326, and the
// localStorage mirror):
//   { v: 1, order: string[], pinned: string[], hidden?: string[], updated_at: iso }
//
// Merge rule (which side wins on mount):
//   - no server layout            → keep local, push it to the server once
//                                   (only if local has anything to say)
//   - server.updated_at > local   → server wins, overwrite the local cache
//   - local.updated_at >= server  → local wins, push local once
//   - no local layout at all      → server wins (even an older stamp)

import { DASHBOARD_WIDGET_IDS } from "./widget-ids";

export const LAYOUT_VERSION = 1 as const;

/** Hard cap on the wire payload (bytes, UTF-8). 15 ids × 3 lists is < 1 KB. */
export const LAYOUT_MAX_BYTES = 4096;

/** A client stamp this far ahead of server time is clamped to `now`. */
export const LAYOUT_FUTURE_SKEW_MS = 5 * 60_000;

export interface DashboardLayout {
  v: typeof LAYOUT_VERSION;
  order: string[];
  pinned: string[];
  hidden?: string[];
  updated_at: string;
}

/* ─── Ordering helpers (moved from widget-grid.tsx, re-exported there) ───── */

/**
 * Filter a stored id list against the set of ids currently declared on the
 * page. Any id that no longer maps to a rendered widget is dropped — this
 * keeps the persisted state self-healing when the dashboard layout evolves
 * across releases.
 */
export function sanitizeStoredIds(stored: unknown, known: readonly string[]): string[] {
  if (!Array.isArray(stored)) return [];
  const knownSet = new Set(known);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of stored) {
    if (typeof raw !== "string") continue;
    if (!knownSet.has(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/**
 * Compute the final render order.
 *
 * Rules:
 *  1. Pinned ids render first, in the order the founder pinned them
 *     (pinnedIds is treated as a stack — earliest pin at index 0).
 *  2. Remaining widgets follow savedOrder, falling back to declarationOrder
 *     for any id the founder hasn't personally sorted yet.
 *  3. Anything unknown to declarationOrder is dropped (self-healing).
 *  4. When savedOrder is empty AND pinnedIds is empty, the output equals
 *     declarationOrder byte-for-byte — this is the SSR guarantee.
 */
export function resolveWidgetOrder(
  declarationOrder: readonly string[],
  savedOrder: readonly string[],
  pinnedIds: readonly string[],
): string[] {
  const declSet = new Set(declarationOrder);
  const pinned = pinnedIds.filter((id) => declSet.has(id));
  const pinnedSet = new Set(pinned);

  const savedFiltered = savedOrder.filter((id) => declSet.has(id) && !pinnedSet.has(id));
  const savedSet = new Set(savedFiltered);

  const tail = declarationOrder.filter((id) => !pinnedSet.has(id) && !savedSet.has(id));

  return [...pinned, ...savedFiltered, ...tail];
}

/* ─── Layout shape ───────────────────────────────────────────────────────── */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Valid ISO-8601 timestamp → epoch ms, else NaN. */
export function layoutStampMs(iso: unknown): number {
  if (typeof iso !== "string" || iso.length === 0 || iso.length > 40) return Number.NaN;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * Validate + normalise an untrusted layout blob (request body, localStorage,
 * DB row). Returns null when the blob is not a layout at all; otherwise a
 * clean copy with every id list filtered against `known` (default: the
 * page allow-list), duplicates removed, and `hidden` omitted when empty.
 *
 * `updated_at` is required and must parse; a stamp more than
 * LAYOUT_FUTURE_SKEW_MS ahead of `now` is clamped to `now` so a client with
 * a wrong clock cannot pin a layout that no other device can ever beat.
 */
export function parseLayout(
  input: unknown,
  known: readonly string[] = DASHBOARD_WIDGET_IDS,
  now: number = Date.now(),
): DashboardLayout | null {
  if (!isPlainObject(input)) return null;
  if (input.v !== LAYOUT_VERSION) return null;
  if (!Array.isArray(input.order) || !Array.isArray(input.pinned)) return null;
  if (input.hidden !== undefined && !Array.isArray(input.hidden)) return null;

  let stamp = layoutStampMs(input.updated_at);
  if (Number.isNaN(stamp)) return null;
  if (stamp > now + LAYOUT_FUTURE_SKEW_MS) stamp = now;

  const pinned = sanitizeStoredIds(input.pinned, known);
  const hidden = sanitizeStoredIds(input.hidden ?? [], known);
  const pinnedSet = new Set(pinned);
  // A widget cannot be pinned and hidden at once — hidden wins (the founder
  // explicitly removed it), and the tail order never carries pinned ids.
  const hiddenSet = new Set(hidden);
  const order = sanitizeStoredIds(input.order, known).filter((id) => !pinnedSet.has(id));
  const pinnedClean = pinned.filter((id) => !hiddenSet.has(id));

  const out: DashboardLayout = {
    v: LAYOUT_VERSION,
    order,
    pinned: pinnedClean,
    updated_at: new Date(stamp).toISOString(),
  };
  if (hidden.length > 0) out.hidden = hidden;
  return out;
}

/** True when the layout carries no customisation at all. */
export function isEmptyLayout(layout: DashboardLayout | null | undefined): boolean {
  if (!layout) return true;
  return (
    layout.order.length === 0 &&
    layout.pinned.length === 0 &&
    (layout.hidden?.length ?? 0) === 0
  );
}

/** UTF-8 byte length of the serialised layout (what the route caps). */
export function layoutByteLength(layout: DashboardLayout): number {
  return new TextEncoder().encode(JSON.stringify(layout)).length;
}

/* ─── Merge rule ─────────────────────────────────────────────────────────── */

export type LayoutMergeSource = "server" | "local" | "none";

export interface LayoutMergeResult {
  /** The layout the grid should render (null = declaration order). */
  layout: DashboardLayout | null;
  /** Which side supplied it. */
  source: LayoutMergeSource;
  /** True when the client should PUT the local layout to the server once. */
  pushLocal: boolean;
  /** True when the client should overwrite its localStorage cache with `layout`. */
  writeLocal: boolean;
}

export function mergeLayouts(
  local: DashboardLayout | null,
  server: DashboardLayout | null,
): LayoutMergeResult {
  const localEmpty = isEmptyLayout(local);
  if (!server) {
    if (!local || localEmpty) return { layout: null, source: "none", pushLocal: false, writeLocal: false };
    return { layout: local, source: "local", pushLocal: true, writeLocal: false };
  }
  if (!local) {
    return { layout: server, source: "server", pushLocal: false, writeLocal: true };
  }
  const serverMs = layoutStampMs(server.updated_at);
  const localMs = layoutStampMs(local.updated_at);
  if (Number.isNaN(localMs) || serverMs > localMs) {
    return { layout: server, source: "server", pushLocal: false, writeLocal: true };
  }
  // Local is at least as new. Only bother pushing when the two differ.
  const same =
    serverMs === localMs &&
    JSON.stringify({ ...server, updated_at: "" }) === JSON.stringify({ ...local, updated_at: "" });
  return { layout: local, source: "local", pushLocal: !same, writeLocal: false };
}

/* ─── Debounce ───────────────────────────────────────────────────────────── */

export interface Debounced<T> {
  /** Schedule `fn(value)` after the delay; a newer call replaces the value. */
  schedule: (value: T) => void;
  /** Run the pending call now (no-op when nothing is pending). */
  flush: () => void;
  /** Drop the pending call. */
  cancel: () => void;
  /** True while a call is pending. */
  pending: () => boolean;
}

/**
 * Trailing-edge debounce that keeps only the latest value. Timer functions
 * are injectable so vitest fake timers (or a custom clock) can drive it.
 */
export function createDebounced<T>(
  fn: (value: T) => void,
  delayMs: number,
  timers: {
    set: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
    clear: (id: ReturnType<typeof setTimeout>) => void;
  } = { set: (cb, ms) => setTimeout(cb, ms), clear: (id) => clearTimeout(id) },
): Debounced<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: { value: T } | null = null;

  const fire = () => {
    timer = null;
    if (!latest) return;
    const { value } = latest;
    latest = null;
    fn(value);
  };

  return {
    schedule(value) {
      latest = { value };
      if (timer !== null) timers.clear(timer);
      timer = timers.set(fire, delayMs);
    },
    flush() {
      if (timer !== null) {
        timers.clear(timer);
        fire();
      }
    },
    cancel() {
      if (timer !== null) timers.clear(timer);
      timer = null;
      latest = null;
    },
    pending() {
      return timer !== null;
    },
  };
}
