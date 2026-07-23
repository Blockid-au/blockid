// WidgetGrid — dashboard personalization (iteration-12 T2, Q3 UX).
//
// Wraps top-level dashboard cards and lets the founder pin + reorder them.
// State is persisted to localStorage only (Q3 scope — no server round-trip).
//
// SSR contract: on the server this component MUST emit children in exactly
// the order they were declared (declarationOrder) — the localStorage read
// happens inside useEffect so first client render matches the server HTML
// and React hydration is stable. After hydration we swap to the resolved
// order.
//
// DnD: HTML5 native (draggable + dragover + drop) — no new dependencies,
// keeping the reseller bundle unchanged. Only the drag HANDLE is draggable
// so text selection inside widget bodies still works.
//
// Pure helpers (resolveWidgetOrder, sanitizeStoredIds) are exported so the
// vitest suite in widget-grid.test.ts can exercise the ordering rules
// without needing a JSX/JSDOM environment.

"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { GripVertical, Pin, PinOff, RotateCcw, Settings2, X } from "lucide-react";

/* ─── Storage keys (versioned) ───────────────────────────────────────────── */

export const WIDGET_ORDER_KEY = "blockid.dashboard.widgets.v1";
export const WIDGET_PINNED_KEY = "blockid.dashboard.widgets.pinned.v1";

/* ─── Pure ordering helpers ──────────────────────────────────────────────── */

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

function readStoredArray(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeStoredArray(key: string, value: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / privacy mode — silently ignore, personalization is best-effort */
  }
}

export function WidgetGrid({ children }: WidgetGridProps) {
  const childRecords = useMemo(() => extractChildren(children), [children]);
  const declarationOrder = useMemo(
    () => childRecords.map((c) => c.id),
    [childRecords],
  );

  // First render (SSR + client hydration): use declaration order so the
  // markup matches. useEffect below swaps in the saved order after mount.
  const [order, setOrder] = useState<string[]>(declarationOrder);
  const [pinned, setPinned] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  // Hydrate from localStorage after mount.
  useEffect(() => {
    const savedOrder = sanitizeStoredIds(readStoredArray(WIDGET_ORDER_KEY), declarationOrder);
    const savedPinned = sanitizeStoredIds(readStoredArray(WIDGET_PINNED_KEY), declarationOrder);
    setOrder(resolveWidgetOrder(declarationOrder, savedOrder, savedPinned));
    setPinned(savedPinned);
    // declarationOrder is derived from children — re-run only when the
    // set of widget ids actually changes.
  }, [declarationOrder]);

  const persist = useCallback(
    (nextOrder: string[], nextPinned: string[]) => {
      const resolved = resolveWidgetOrder(declarationOrder, nextOrder, nextPinned);
      setOrder(resolved);
      setPinned(nextPinned);
      // Store only the non-pinned tail order — pinned ids are stored
      // separately so unpinning restores their previous slot cleanly.
      const pinnedSet = new Set(nextPinned);
      const tailOrder = resolved.filter((id) => !pinnedSet.has(id));
      writeStoredArray(WIDGET_ORDER_KEY, tailOrder);
      writeStoredArray(WIDGET_PINNED_KEY, nextPinned);
    },
    [declarationOrder],
  );

  const togglePin = useCallback(
    (id: string) => {
      const isPinned = pinned.includes(id);
      const nextPinned = isPinned ? pinned.filter((p) => p !== id) : [...pinned, id];
      const pinnedSet = new Set(nextPinned);
      const nextOrder = order.filter((o) => !pinnedSet.has(o));
      persist(nextOrder, nextPinned);
    },
    [order, pinned, persist],
  );

  const handleDrop = useCallback(
    (targetId: string) => {
      if (!dragId || dragId === targetId) {
        setDragId(null);
        return;
      }
      const source = dragId;
      setDragId(null);
      const current = [...order];
      const from = current.indexOf(source);
      const to = current.indexOf(targetId);
      if (from < 0 || to < 0) return;
      current.splice(from, 1);
      current.splice(to, 0, source);
      const pinnedSet = new Set(pinned);
      const nextTail = current.filter((id) => !pinnedSet.has(id));
      persist(nextTail, pinned);
    },
    [dragId, order, pinned, persist],
  );

  const reset = useCallback(() => {
    writeStoredArray(WIDGET_ORDER_KEY, []);
    writeStoredArray(WIDGET_PINNED_KEY, []);
    setOrder(declarationOrder);
    setPinned([]);
  }, [declarationOrder]);

  const byId = useMemo(() => {
    const m = new Map<string, ReactElement<Record<string, unknown>>>();
    for (const c of childRecords) m.set(c.id, c.element);
    return m;
  }, [childRecords]);

  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  return (
    <div className="space-y-6" data-widget-grid="root">
      {/* Customize toolbar */}
      <div className="flex justify-end">
        {editMode ? (
          <div className="flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-2 py-1 text-xs">
            <span className="pl-2 font-medium text-brand-700">Customizing dashboard</span>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 font-medium text-ink-700 hover:text-brand-700"
              aria-label="Reset dashboard layout"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
            <button
              type="button"
              onClick={() => setEditMode(false)}
              className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-700"
              aria-label="Done customizing"
            >
              <X className="h-3 w-3" /> Done
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 hover:border-brand-300 hover:text-brand-700"
            aria-label="Customize dashboard layout"
          >
            <Settings2 className="h-3.5 w-3.5" /> Customize
          </button>
        )}
      </div>

      {/* Ordered widgets */}
      {order.map((id) => {
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
                  aria-label={`${id} pinned`}
                >
                  <Pin className="h-2.5 w-2.5" /> Pinned
                </span>
              )}
              {element}
            </div>
          );
        }

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
            <div className="flex items-center justify-between border-b border-brand-100 px-3 py-2">
              <div
                draggable
                onDragStart={() => setDragId(id)}
                onDragEnd={() => setDragId(null)}
                className="inline-flex cursor-grab items-center gap-2 text-xs font-medium text-ink-600 active:cursor-grabbing"
                aria-label={`Drag ${id}`}
                role="button"
              >
                <GripVertical className="h-4 w-4 text-ink-400" />
                <span className="uppercase tracking-wider text-[10px]">{id}</span>
              </div>
              <button
                type="button"
                onClick={() => togglePin(id)}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${
                  isPinned
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "bg-surface-100 text-ink-600 hover:bg-brand-50 hover:text-brand-700"
                }`}
                aria-label={isPinned ? `Unpin ${id}` : `Pin ${id}`}
              >
                {isPinned ? (
                  <>
                    <PinOff className="h-3 w-3" /> Unpin
                  </>
                ) : (
                  <>
                    <Pin className="h-3 w-3" /> Pin
                  </>
                )}
              </button>
            </div>
            <div className="p-3 opacity-90 pointer-events-none">{element}</div>
          </div>
        );
      })}
    </div>
  );
}
