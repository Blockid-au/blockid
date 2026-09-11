// WidgetGrid — dashboard personalization (iteration-12 T2, Q3 UX; G4 #4
// server sync 2026-09-11).
//
// Wraps top-level dashboard cards and lets the founder pin, reorder and hide
// them. State lives in two places:
//   - localStorage — the instant cache and the signed-out / offline fallback
//     (keys below, plus a stamp key holding the last-change time), and
//   - app_users.dashboard_layout via GET/PUT /api/dashboard/layout — so the
//     layout follows the founder across browsers and devices.
// On mount the local copy renders immediately, then the server copy is
// fetched and the side with the newer `updated_at` wins (mergeLayouts in
// lib/dashboard/widget-layout.ts). Every change writes localStorage at once
// and debounces a PUT (SYNC_DEBOUNCE_MS); a pending PUT is flushed with
// `keepalive` when the grid unmounts. Fetch failures and 401s are silent.
//
// SSR contract: on the server this component MUST emit children in exactly
// the order they were declared (declarationOrder) — the localStorage read
// happens inside useEffect so first client render matches the server HTML
// and React hydration is stable. After hydration we swap to the resolved
// order.
//
// DnD: HTML5 native (draggable + dragover + drop) — no new dependencies,
// keeping the reseller bundle unchanged (only the founder dashboard page
// imports this file). Only the drag HANDLE is draggable so text selection
// inside widget bodies still works.
//
// Keyboard (S8-B a11y audit, WCAG 2.5.7 Dragging Movements / 2.1.1): the
// handle is a focusable `role="button"`; ArrowUp/ArrowDown/Home/End on it
// move the widget one slot (`moveIndex` in lib/a11y/keyboard.ts), and every
// slot also carries explicit "Move up" / "Move down" buttons for switch and
// voice users. Each move is announced through a polite live region. While
// customising, the widget body is `inert` so Tab never lands inside a card
// whose pointer events are already off.
//
// Pure helpers (resolveWidgetOrder, sanitizeStoredIds, mergeLayouts,
// createDebounced) live in lib/dashboard/widget-layout.ts so both the
// server route and the vitest suite can use them without JSX/JSDOM; the
// first two are re-exported here for existing importers.

"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Pin, PinOff, RotateCcw, Settings2, X } from "lucide-react";
import { DASHBOARD_WIDGET_IDS } from "@/lib/dashboard/widget-ids";
import { moveIndex } from "@/lib/a11y/keyboard";
import {
  createDebounced,
  mergeLayouts,
  parseLayout,
  resolveWidgetOrder,
  sanitizeStoredIds,
  type DashboardLayout,
  type Debounced,
} from "@/lib/dashboard/widget-layout";

export { resolveWidgetOrder, sanitizeStoredIds };

/* ─── Storage keys (versioned) ───────────────────────────────────────────── */

export const WIDGET_ORDER_KEY = "blockid.dashboard.widgets.v1";
export const WIDGET_PINNED_KEY = "blockid.dashboard.widgets.pinned.v1";
export const WIDGET_HIDDEN_KEY = "blockid.dashboard.widgets.hidden.v1";
/** ISO timestamp of the last local change — compared with the server stamp. */
export const WIDGET_STAMP_KEY = "blockid.dashboard.widgets.updated.v1";

export const LAYOUT_ENDPOINT = "/api/dashboard/layout";
export const SYNC_DEBOUNCE_MS = 800;

/** Stamp given to pre-sync localStorage data (order/pinned but no stamp key). */
const LEGACY_STAMP = "1970-01-01T00:00:00.000Z";

/* ─── localStorage mirror ────────────────────────────────────────────────── */

function readStoredJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / privacy mode — silently ignore, personalization is best-effort */
  }
}

/**
 * Assemble the localStorage copy into a DashboardLayout. Returns null when
 * nothing has ever been stored. Data written before the stamp key existed
 * gets LEGACY_STAMP so a server copy (if any) wins over it.
 */
export function readLocalLayout(known: readonly string[]): DashboardLayout | null {
  const order = readStoredJson(WIDGET_ORDER_KEY);
  const pinned = readStoredJson(WIDGET_PINNED_KEY);
  const hidden = readStoredJson(WIDGET_HIDDEN_KEY);
  const stamp = readStoredJson(WIDGET_STAMP_KEY);
  if (order === null && pinned === null && hidden === null) return null;
  return parseLayout(
    {
      v: 1,
      order: Array.isArray(order) ? order : [],
      pinned: Array.isArray(pinned) ? pinned : [],
      hidden: Array.isArray(hidden) ? hidden : [],
      updated_at: typeof stamp === "string" ? stamp : LEGACY_STAMP,
    },
    known,
  );
}

export function writeLocalLayout(layout: DashboardLayout): void {
  writeStoredJson(WIDGET_ORDER_KEY, layout.order);
  writeStoredJson(WIDGET_PINNED_KEY, layout.pinned);
  writeStoredJson(WIDGET_HIDDEN_KEY, layout.hidden ?? []);
  writeStoredJson(WIDGET_STAMP_KEY, layout.updated_at);
}

/* ─── Server sync ────────────────────────────────────────────────────────── */

async function putLayout(layout: DashboardLayout, keepalive = false): Promise<void> {
  if (typeof fetch !== "function") return;
  try {
    await fetch(LAYOUT_ENDPOINT, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(layout),
      keepalive,
    });
  } catch {
    /* offline / signed out — localStorage already has the change */
  }
}

async function fetchServerLayout(
  known: readonly string[],
  signal: AbortSignal,
): Promise<{ fetched: boolean; layout: DashboardLayout | null }> {
  if (typeof fetch !== "function") return { fetched: false, layout: null };
  try {
    const res = await fetch(LAYOUT_ENDPOINT, {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!res.ok) return { fetched: false, layout: null };
    const json = (await res.json()) as { ok?: boolean; layout?: unknown };
    if (!json?.ok) return { fetched: false, layout: null };
    return { fetched: true, layout: parseLayout(json.layout, known) };
  } catch {
    return { fetched: false, layout: null };
  }
}

/* ─── Edit-mode slot header (presentational, exported for the render test) ── */

const handleClass =
  "inline-flex min-h-6 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium";

/** Keys the drag handle answers to — the keyboard alternative to dragging. */
export const WIDGET_MOVE_KEYS: readonly string[] = ["ArrowUp", "ArrowDown", "Home", "End"];

export interface WidgetEditControlsProps {
  id: string;
  /** 0-based slot among the visible widgets. */
  position: number;
  count: number;
  isPinned: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  /** Called with the key name (ArrowUp / ArrowDown / Home / End). */
  onMove: (key: string) => void;
  onTogglePin: () => void;
  onHide: () => void;
}

/**
 * The strip above a widget while customising: focusable drag handle
 * (arrow keys reorder), explicit Move up / Move down buttons, Pin toggle
 * (`aria-pressed`) and Hide. All icons are decorative — the names live in
 * `aria-label` / visible text.
 */
export function WidgetEditControls({ id, position, count, isPinned, onDragStart, onDragEnd, onMove, onTogglePin, onHide }: WidgetEditControlsProps) {
  const isFirst = position === 0;
  const isLast = position === count - 1;
  return (
    <div className="flex items-center justify-between border-b border-brand-100 px-3 py-2">
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onKeyDown={(e) => {
          if (WIDGET_MOVE_KEYS.includes(e.key)) {
            e.preventDefault();
            onMove(e.key);
          }
        }}
        className="inline-flex min-h-6 cursor-grab items-center gap-2 rounded-md text-xs font-medium text-ink-600 active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        aria-label={`Move ${id}, position ${position + 1} of ${count}. Use the up and down arrow keys to reorder.`}
        aria-describedby="widget-grid-reorder-hint"
        role="button"
        tabIndex={0}
        data-widget-handle={id}
      >
        <GripVertical className="h-4 w-4 text-muted" aria-hidden="true" />
        <span className="uppercase tracking-wider text-[10px]">{id}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onMove("ArrowUp")}
          disabled={isFirst}
          className={`${handleClass} bg-surface-100 text-ink-600 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40`}
          aria-label={`Move ${id} up`}
          data-widget-move="up"
        >
          <ChevronUp className="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onMove("ArrowDown")}
          disabled={isLast}
          className={`${handleClass} bg-surface-100 text-ink-600 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40`}
          aria-label={`Move ${id} down`}
          data-widget-move="down"
        >
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onTogglePin}
          className={`${handleClass} ${
            isPinned
              ? "bg-brand-600 text-white hover:bg-brand-700"
              : "bg-surface-100 text-ink-600 hover:bg-brand-50 hover:text-brand-700"
          }`}
          aria-pressed={isPinned}
          aria-label={isPinned ? `Unpin ${id}` : `Pin ${id}`}
        >
          {isPinned ? (
            <>
              <PinOff className="h-3 w-3" aria-hidden="true" /> Unpin
            </>
          ) : (
            <>
              <Pin className="h-3 w-3" aria-hidden="true" /> Pin
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onHide}
          className={`${handleClass} bg-surface-100 text-ink-600 hover:bg-brand-50 hover:text-brand-700`}
          aria-label={`Hide ${id}`}
        >
          <EyeOff className="h-3 w-3" aria-hidden="true" /> Hide
        </button>
      </div>
    </div>
  );
}

/* ─── React component ────────────────────────────────────────────────────── */

interface WidgetGridProps {
  children: ReactNode;
}

interface ChildRecord {
  id: string;
  element: ReactElement<Record<string, unknown>>;
}

function extractChildren(children: ReactNode): ChildRecord[] {
  const out: ChildRecord[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as Record<string, unknown>;
    const id = props["data-widget-id"];
    if (typeof id !== "string" || id.length === 0) return;
    out.push({ id, element: child as ReactElement<Record<string, unknown>> });
  });
  return out;
}

const EMPTY_IDS: readonly string[] = [];

export function WidgetGrid({ children }: WidgetGridProps) {
  const childRecords = useMemo(() => extractChildren(children), [children]);
  const declarationOrder = useMemo(
    () => childRecords.map((c) => c.id),
    [childRecords],
  );
  // Ids we are willing to persist: the page allow-list plus whatever is
  // declared right now. Persisting against the allow-list (not just the
  // declared set) keeps an entry for a widget that is conditionally absent
  // today — e.g. health-score before a project exists — so its slot survives.
  const knownIds = useMemo(() => {
    const set = new Set<string>(DASHBOARD_WIDGET_IDS);
    for (const id of declarationOrder) set.add(id);
    return Array.from(set);
  }, [declarationOrder]);

  // First render (SSR + client hydration): null layout → declaration order
  // so the markup matches. The mount effect below swaps in the saved copy.
  const [layout, setLayout] = useState<DashboardLayout | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  /** Polite live-region text — the last keyboard / button move, pin, hide or show. */
  const [announcement, setAnnouncement] = useState("");

  const savedOrder = layout?.order ?? EMPTY_IDS;
  const pinned = layout?.pinned ?? EMPTY_IDS;
  const hidden = layout?.hidden ?? EMPTY_IDS;

  const order = useMemo(
    () => resolveWidgetOrder(declarationOrder, savedOrder, pinned),
    [declarationOrder, savedOrder, pinned],
  );
  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const visibleOrder = useMemo(() => order.filter((id) => !hiddenSet.has(id)), [order, hiddenSet]);
  const hiddenDeclared = useMemo(() => order.filter((id) => hiddenSet.has(id)), [order, hiddenSet]);

  // Debounced PUT — one instance for the grid's lifetime; flushed on unmount.
  const syncRef = useRef<Debounced<DashboardLayout> | null>(null);
  useEffect(() => {
    const debounced = createDebounced<DashboardLayout>((next) => {
      void putLayout(next);
    }, SYNC_DEBOUNCE_MS);
    syncRef.current = debounced;
    return () => {
      // Navigating away mid-debounce must not lose the change: send it now.
      if (debounced.pending()) {
        debounced.cancel();
        const last = readLocalLayout(knownIds);
        if (last) void putLayout(last, true);
      }
      syncRef.current = null;
    };
  }, [knownIds]);

  // Mount: localStorage first (instant), then the server copy; newer wins.
  useEffect(() => {
    const local = readLocalLayout(knownIds);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration read of localStorage; a lazy initialiser would mismatch the server render
    setLayout(local);

    const ctrl = new AbortController();
    void (async () => {
      const server = await fetchServerLayout(knownIds, ctrl.signal);
      if (ctrl.signal.aborted || !server.fetched) return; // signed out / offline → local only
      // Re-read local: the founder may have edited while the fetch was in flight.
      const merged = mergeLayouts(readLocalLayout(knownIds), server.layout);
      if (merged.writeLocal && merged.layout) {
        writeLocalLayout(merged.layout);
        setLayout(merged.layout);
      }
      if (merged.pushLocal && merged.layout) void putLayout(merged.layout);
    })();
    return () => ctrl.abort();
    // knownIds is derived from children — re-run only when the set of
    // widget ids actually changes.
  }, [knownIds]);

  /** Apply a new layout: state → localStorage (now) → server (debounced). */
  const commit = useCallback(
    (patch: { order: string[]; pinned: string[]; hidden: string[] }) => {
      const next = parseLayout({ v: 1, ...patch, updated_at: new Date().toISOString() }, knownIds);
      if (!next) return;
      setLayout(next);
      writeLocalLayout(next);
      syncRef.current?.schedule(next);
    },
    [knownIds],
  );

  /**
   * Build the tail order (non-pinned) to persist from the currently visible
   * sequence: visible ids first, then hidden ones (keeping their slot for
   * when they are shown again), then saved ids that are not declared today.
   */
  const buildTail = useCallback(
    (visible: readonly string[], nextPinned: readonly string[], nextHidden: readonly string[]) => {
      const nextPinnedSet = new Set(nextPinned);
      const seen = new Set<string>();
      const out: string[] = [];
      const push = (id: string) => {
        if (nextPinnedSet.has(id) || seen.has(id)) return;
        seen.add(id);
        out.push(id);
      };
      visible.forEach(push);
      nextHidden.forEach(push);
      savedOrder.forEach(push);
      return out;
    },
    [savedOrder],
  );

  const togglePin = useCallback(
    (id: string) => {
      const isPinned = pinnedSet.has(id);
      const nextPinned = isPinned ? pinned.filter((p) => p !== id) : [...pinned, id];
      commit({ order: buildTail(visibleOrder, nextPinned, hidden), pinned: nextPinned, hidden: [...hidden] });
    },
    [pinned, pinnedSet, visibleOrder, hidden, buildTail, commit],
  );

  const hideWidget = useCallback(
    (id: string) => {
      if (hiddenSet.has(id)) return;
      const nextPinned = pinned.filter((p) => p !== id);
      const nextHidden = [...hidden, id];
      commit({ order: buildTail(visibleOrder, nextPinned, nextHidden), pinned: nextPinned, hidden: nextHidden });
    },
    [hiddenSet, pinned, hidden, visibleOrder, buildTail, commit],
  );

  const showWidget = useCallback(
    (id: string) => {
      if (!hiddenSet.has(id)) return;
      const nextHidden = hidden.filter((h) => h !== id);
      commit({ order: buildTail(order, pinned, nextHidden), pinned: [...pinned], hidden: nextHidden });
    },
    [hiddenSet, hidden, order, pinned, buildTail, commit],
  );

  const showAllHidden = useCallback(() => {
    if (hidden.length === 0) return;
    commit({ order: buildTail(order, pinned, []), pinned: [...pinned], hidden: [] });
  }, [hidden, order, pinned, buildTail, commit]);

  const handleDrop = useCallback(
    (targetId: string) => {
      if (!dragId || dragId === targetId) {
        setDragId(null);
        return;
      }
      const source = dragId;
      setDragId(null);
      const current = [...visibleOrder];
      const from = current.indexOf(source);
      const to = current.indexOf(targetId);
      if (from < 0 || to < 0) return;
      current.splice(from, 1);
      current.splice(to, 0, source);
      commit({ order: buildTail(current, pinned, hidden), pinned: [...pinned], hidden: [...hidden] });
    },
    [dragId, visibleOrder, pinned, hidden, buildTail, commit],
  );

  /**
   * Keyboard / button reorder — the drag-and-drop alternative. `key` is an
   * arrow / Home / End key name; returns true when the widget moved.
   */
  const moveWidget = useCallback(
    (id: string, key: string): boolean => {
      const from = visibleOrder.indexOf(id);
      const to = moveIndex(key, from, visibleOrder.length);
      if (to === null) {
        setAnnouncement(`${id} is already at the ${from === 0 ? "top" : "bottom"}`);
        return false;
      }
      const current = [...visibleOrder];
      current.splice(from, 1);
      current.splice(to, 0, id);
      commit({ order: buildTail(current, pinned, hidden), pinned: [...pinned], hidden: [...hidden] });
      setAnnouncement(`${id} moved to position ${to + 1} of ${visibleOrder.length}`);
      return true;
    },
    [visibleOrder, pinned, hidden, buildTail, commit],
  );

  // Reset is itself a change (fresh stamp) so it propagates to other devices.
  const reset = useCallback(() => {
    commit({ order: [], pinned: [], hidden: [] });
  }, [commit]);

  const byId = useMemo(() => {
    const m = new Map<string, ReactElement<Record<string, unknown>>>();
    for (const c of childRecords) m.set(c.id, c.element);
    return m;
  }, [childRecords]);

  return (
    <div className="space-y-6" data-widget-grid="root">
      {/* Announces keyboard moves / pin / hide so a screen-reader user hears what changed. */}
      <p className="sr-only" role="status" aria-live="polite" data-widget-announce>
        {announcement}
      </p>
      {/* Customize toolbar */}
      <div className="flex justify-end">
        {editMode ? (
          <div className="flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-2 py-1 text-xs">
            <span className="pl-2 font-medium text-brand-700">Customizing dashboard</span>
            <button
              type="button"
              onClick={() => {
                reset();
                setAnnouncement("Dashboard layout reset to the default order");
              }}
              className="inline-flex min-h-6 items-center gap-1 rounded-full bg-white px-3 py-1 font-medium text-ink-700 hover:text-brand-700"
              aria-label="Reset dashboard layout"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
            <button
              type="button"
              onClick={() => setEditMode(false)}
              className="inline-flex min-h-6 items-center gap-1 rounded-full bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-700"
              aria-label="Done customizing"
            >
              <X className="h-3 w-3" /> Done
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="inline-flex min-h-6 items-center gap-2 rounded-full border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 hover:border-brand-300 hover:text-brand-700"
            aria-label="Customize dashboard layout"
          >
            <Settings2 className="h-3.5 w-3.5" /> Customize
          </button>
        )}
      </div>

      {/* Ordered, visible widgets */}
      {visibleOrder.map((id) => {
        const element = byId.get(id);
        if (!element) return null;
        const isPinned = pinnedSet.has(id);
        const isDragging = dragId === id;

        if (!editMode) {
          return (
            <div key={id} data-widget-slot={id} className="relative">
              {isPinned && (
                <span
                  className="absolute -top-2 right-4 z-10 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                  data-widget-pinned-badge
                >
                  <Pin className="h-2.5 w-2.5" aria-hidden="true" /> Pinned
                </span>
              )}
              {element}
            </div>
          );
        }

        const position = visibleOrder.indexOf(id);

        return (
          <div
            key={id}
            data-widget-slot={id}
            data-widget-editing="true"
            className={`relative rounded-2xl border-2 border-dashed transition-colors ${
              isDragging
                ? "border-brand-500 bg-brand-50/40"
                : "border-brand-200 bg-white/60"
            }`}
            onDragOver={(e) => {
              if (dragId && dragId !== id) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(id);
            }}
          >
            <WidgetEditControls
              id={id}
              position={position}
              count={visibleOrder.length}
              isPinned={isPinned}
              onDragStart={() => setDragId(id)}
              onDragEnd={() => setDragId(null)}
              onMove={(key) => moveWidget(id, key)}
              onTogglePin={() => {
                togglePin(id);
                setAnnouncement(isPinned ? `${id} unpinned` : `${id} pinned to the top`);
              }}
              onHide={() => {
                hideWidget(id);
                setAnnouncement(`${id} hidden — find it under Hidden widgets`);
              }}
            />
            {/* inert: the preview is display-only while customising — keyboard focus must not land inside it. */}
            <div className="p-3 opacity-90 pointer-events-none" inert>
              {element}
            </div>
          </div>
        );
      })}

      {editMode ? (
        <p id="widget-grid-reorder-hint" className="sr-only">
          Drag a widget by its handle, or focus the handle and press the up and down arrow keys, Home or End, to reorder.
        </p>
      ) : null}

      {/* Hidden widgets — compact rows while customizing, one link otherwise */}
      {editMode && hiddenDeclared.length > 0 && (
        <div className="space-y-2" data-widget-hidden-list="true" role="group" aria-labelledby="widget-grid-hidden-heading">
          <p id="widget-grid-hidden-heading" className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Hidden widgets ({hiddenDeclared.length})
          </p>
          {hiddenDeclared.map((id) => (
            <div
              key={id}
              data-widget-slot={id}
              data-widget-hidden="true"
              className="flex items-center justify-between rounded-2xl border-2 border-dashed border-surface-200 bg-surface-50/60 px-3 py-2 opacity-70"
            >
              <span className="inline-flex items-center gap-2 text-xs font-medium text-ink-600">
                <EyeOff className="h-4 w-4 text-muted" aria-hidden="true" />
                <span className="uppercase tracking-wider text-[10px]">{id}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  showWidget(id);
                  setAnnouncement(`${id} shown again`);
                }}
                className={`${handleClass} bg-white text-ink-600 hover:bg-brand-50 hover:text-brand-700`}
                aria-label={`Show ${id}`}
              >
                <Eye className="h-3 w-3" aria-hidden="true" /> Show
              </button>
            </div>
          ))}
        </div>
      )}
      {!editMode && hiddenDeclared.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={showAllHidden}
            className="inline-flex min-h-6 items-center gap-1 text-xs font-medium text-muted underline-offset-2 hover:text-brand-700 hover:underline"
          >
            <Eye className="h-3 w-3" aria-hidden="true" /> Show hidden widgets ({hiddenDeclared.length})
          </button>
        </div>
      )}
    </div>
  );
}
