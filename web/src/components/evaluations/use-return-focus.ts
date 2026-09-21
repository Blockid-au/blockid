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
// during render.

import * as React from "react";

export function useReturnFocus(open: boolean): void {
  const lastFocused = React.useRef<HTMLElement | null>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) return;
    const pick = (el: Element | null): HTMLElement | null => (el instanceof HTMLElement && el !== document.body ? el : null);
    lastFocused.current = pick(document.activeElement);
    const onFocusIn = (e: FocusEvent) => {
      lastFocused.current = pick(e.target instanceof Element ? e.target : null);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    returnTo.current = lastFocused.current;
    return () => {
      const el = returnTo.current;
      returnTo.current = null;
      if (el && el.isConnected && typeof el.focus === "function") el.focus();
    };
  }, [open]);
}
