// Keyboard helpers shared by the tab strips, the dashboard widget grid and
// the workspace dialogs (S8-B a11y audit, 2026-09-11). Pure functions — no
// React, no DOM globals at import time — so the vitest suite can pin the
// key → index arithmetic without JSDOM. `focusableWithin` / `trapTab` take
// the container element as an argument for the same reason.
//
//   rovingIndex(key, index, length)  → next index for ArrowLeft/Right/Up/Down/Home/End, or null
//   moveIndex(key, index, length)    → same for a reorder handle (no wrap; null at the edges)
//   focusableWithin(el)              → tabbable descendants in DOM order
//   trapTab(event, el)               → keeps Tab / Shift+Tab inside `el`
//
// WCAG 2.2 refs: 2.1.1 Keyboard, 2.1.2 No Keyboard Trap (the dialog trap is
// released by Escape / close), 2.4.3 Focus Order, 4.1.2 Name/Role/Value.

export type RovingOrientation = "horizontal" | "vertical" | "both";

const PREV_KEYS: Record<RovingOrientation, readonly string[]> = {
  horizontal: ["ArrowLeft"],
  vertical: ["ArrowUp"],
  both: ["ArrowLeft", "ArrowUp"],
};
const NEXT_KEYS: Record<RovingOrientation, readonly string[]> = {
  horizontal: ["ArrowRight"],
  vertical: ["ArrowDown"],
  both: ["ArrowRight", "ArrowDown"],
};

/**
 * Roving-tabindex arithmetic for a `role="tablist"` / toolbar: arrows wrap,
 * Home / End jump to the ends. Returns null for any key that is not part of
 * the pattern so the caller can leave the event alone.
 */
export function rovingIndex(
  key: string,
  index: number,
  length: number,
  orientation: RovingOrientation = "horizontal",
): number | null {
  if (length <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (PREV_KEYS[orientation].includes(key)) return (index - 1 + length) % length;
  if (NEXT_KEYS[orientation].includes(key)) return (index + 1) % length;
  return null;
}

/**
 * Keyboard alternative to drag-and-drop reorder (WCAG 2.5.7 Dragging
 * Movements): ArrowUp / ArrowLeft move the item one slot earlier, ArrowDown /
 * ArrowRight one slot later, Home / End to the ends. No wrap — at an edge the
 * result is null so nothing moves and the announcement can say so.
 */
export function moveIndex(key: string, index: number, length: number): number | null {
  if (length <= 1 || index < 0 || index >= length) return null;
  if (key === "Home") return index === 0 ? null : 0;
  if (key === "End") return index === length - 1 ? null : length - 1;
  if (key === "ArrowUp" || key === "ArrowLeft") return index === 0 ? null : index - 1;
  if (key === "ArrowDown" || key === "ArrowRight") return index === length - 1 ? null : index + 1;
  return null;
}

/** Elements that take focus via Tab. `inert` subtrees are excluded by the browser itself. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "iframe",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

/** Tabbable descendants of `container`, in DOM order, skipping anything hidden via `hidden` / `aria-hidden`. */
export function focusableWithin(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter((el) => {
    if (el.hidden) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.closest("[hidden],[aria-hidden='true'],[inert]")) return false;
    return true;
  });
}

/**
 * Cycle Tab / Shift+Tab inside `container`. Call from a keydown handler on
 * the dialog root; returns true when it consumed the event.
 */
export function trapTab(event: { key: string; shiftKey: boolean; preventDefault: () => void }, container: HTMLElement, active?: Element | null): boolean {
  if (event.key !== "Tab") return false;
  const items = focusableWithin(container);
  if (items.length === 0) {
    event.preventDefault();
    container.focus();
    return true;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const current = active ?? (typeof document !== "undefined" ? document.activeElement : null);
  const inside = Boolean(current) && container.contains(current as Node);
  if (event.shiftKey) {
    if (!inside || current === first || current === container) {
      event.preventDefault();
      last.focus();
      return true;
    }
    return false;
  }
  if (!inside || current === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
