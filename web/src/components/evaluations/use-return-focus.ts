"use client";

// useReturnFocus — give focus back to the control that opened a dialog /
// drawer when it closes (G22-A A.4; WCAG 2.4.3 focus order). Used by
// OverrideDialog, CompareDrawer and ProgramWeightsDialog on the BlockID
// Cohort page so a keyboard user lands back on the "Override" / "Compare" /
// "Edit program weights" button instead of <body>.
//
// While CLOSED the hook follows focus (`focusin` on the document, seeded
// with the current activeElement) into a ref. When `open` flips true the
// closed-phase cleanup removes that listener BEFORE any child effect runs
// (React runs every cleanup of a commit before any new effect), so the
// dialog's own first-field focus() never overwrites the captured opener.
// The open-phase effect then pins the opener; its cleanup (close / unmount)
// gives it focus back when it is still in the document. No ref is touched
// during render. The tracking itself is `createFocusReturn` — pure over a
// document-like object so the colocated test can drive it without a DOM.

import * as React from "react";

export interface FocusReturnDoc {
  activeElement: Element | null;
  body: Element | null;
  addEventListener(type: "focusin", listener: (e: { target: EventTarget | null }) => void): void;
  removeEventListener(type: "focusin", listener: (e: { target: EventTarget | null }) => void): void;
}

export interface FocusReturn {
  /** Closed phase: seed with the current activeElement and follow focusin. Returns the stop function. */
  follow(): () => void;
  /** Open phase: remember the last followed element as the return target. */
  pin(): void;
  /** Close: focus the pinned element when it is still connected; clears the pin. Returns whether focus moved. */
  restore(): boolean;
  /** The last element focus was seen on while closed (test / debug). */
  readonly last: HTMLElement | null;
}

/** Duck-typed on purpose (no HTMLElement global in the unit runner): anything with focus() that is not <body>. */
function isFocusable(doc: FocusReturnDoc, el: unknown): el is HTMLElement {
  return !!el && typeof el === "object" && typeof (el as { focus?: unknown }).focus === "function" && el !== doc.body;
}

/** Pure over a document-like object: the tracking behind useReturnFocus. */
export function createFocusReturn(doc: FocusReturnDoc): FocusReturn {
  let last: HTMLElement | null = null;
  let pinned: HTMLElement | null = null;
  return {
    get last() {
      return last;
    },
    follow() {
      last = isFocusable(doc, doc.activeElement) ? doc.activeElement : null;
      const onFocusIn = (e: { target: EventTarget | null }) => {
        last = isFocusable(doc, e.target) ? e.target : null;
      };
      doc.addEventListener("focusin", onFocusIn);
      return () => doc.removeEventListener("focusin", onFocusIn);
    },
    pin() {
      pinned = last;
    },
    restore() {
      const el = pinned;
      pinned = null;
      if (el && el.isConnected && typeof el.focus === "function") {
        el.focus();
        return true;
      }
      return false;
    },
  };
}

export function useReturnFocus(open: boolean): void {
  const tracker = React.useRef<FocusReturn | null>(null);
  const get = () => {
    if (!tracker.current) tracker.current = createFocusReturn(document);
    return tracker.current;
  };

  React.useEffect(() => {
    if (open) return;
    return get().follow();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const t = get();
    t.pin();
    return () => {
      t.restore();
    };
  }, [open]);
}
