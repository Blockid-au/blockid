// use-return-focus (G22-A A.4) — the tracking behind the hook, driven over
// a fake document (this workspace has no DOM runner). Pins: follow() seeds
// with the current activeElement (never <body>) and tracks focusin until
// stopped; pin() freezes the opener; restore() focuses it once when still
// connected, returns false (and never throws) for a detached / missing
// element; a focus that lands on a dialog control AFTER follow() stopped
// does not overwrite the opener — the ordering the hook relies on.

import { describe, expect, it, vi } from "vitest";
import { createFocusReturn, type FocusReturnDoc } from "./use-return-focus";

type Listener = (e: { target: EventTarget | null }) => void;

function fakeEl(name: string, connected = true) {
  return { name, isConnected: connected, focus: vi.fn() };
}

function fakeDoc(active: unknown = null) {
  const listeners = new Set<Listener>();
  const body = { name: "body", isConnected: true, focus: vi.fn() };
  const doc: FocusReturnDoc & { fire(target: unknown): void; listeners: Set<Listener> } = {
    activeElement: active as Element | null,
    body: body as unknown as Element,
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
    fire: (target) => {
      for (const l of listeners) l({ target: target as EventTarget });
    },
    listeners,
  };
  return { doc, body };
}

describe("createFocusReturn", () => {
  it("seeds from activeElement, follows focusin, and restores the pinned opener once", () => {
    const opener = fakeEl("compare-button");
    const { doc } = fakeDoc(opener);
    const t = createFocusReturn(doc);
    const stop = t.follow();
    expect(t.last).toBe(opener);
    const other = fakeEl("override-button");
    doc.fire(other);
    expect(t.last).toBe(other);
    stop();
    expect(doc.listeners.size).toBe(0);
    // The dialog's own control takes focus AFTER following stopped — the opener stays.
    doc.fire(fakeEl("dialog-close"));
    expect(t.last).toBe(other);
    t.pin();
    expect(t.restore()).toBe(true);
    expect(other.focus).toHaveBeenCalledTimes(1);
    // A second restore is a no-op (the pin is cleared).
    expect(t.restore()).toBe(false);
    expect(other.focus).toHaveBeenCalledTimes(1);
  });

  it("<body> and non-focusable targets never become the opener; a detached element is not focused", () => {
    const { doc, body } = fakeDoc(null);
    const t = createFocusReturn(doc);
    const stop = t.follow();
    expect(t.last).toBeNull();
    doc.fire(body);
    expect(t.last).toBeNull();
    doc.fire({ notAnElement: true });
    expect(t.last).toBeNull();
    const detached = fakeEl("removed-row-button", false);
    doc.fire(detached);
    expect(t.last).toBe(detached);
    stop();
    t.pin();
    expect(t.restore()).toBe(false);
    expect(detached.focus).not.toHaveBeenCalled();
  });

  it("pin() without a follow() phase restores nothing", () => {
    const { doc } = fakeDoc();
    const t = createFocusReturn(doc);
    t.pin();
    expect(t.restore()).toBe(false);
  });
});
