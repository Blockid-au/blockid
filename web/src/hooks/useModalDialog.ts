"use client";

// useModalDialog — the behaviour a `role="dialog" aria-modal="true"` overlay
// needs and that plain markup does not give you (S8-B a11y audit):
//
//   • initial focus moves into the dialog (first tabbable, else the root),
//   • Tab / Shift+Tab stay inside (WCAG 2.1.2 — released by Escape / close),
//   • Escape calls onClose (WCAG 2.1.1; ARIA APG dialog pattern),
//   • focus returns to whatever opened the dialog when it closes (2.4.3).
//
// `aria-modal="true"` on the root is what tells assistive tech to treat the
// rest of the page as inert; this hook does not toggle aria-hidden on the
// page (Next's app-router tree puts the overlay inside the page root, so a
// sibling sweep would only ever hide toasts and dev overlays).
//
// Pass the ref that is attached to the dialog ROOT (the element carrying
// role="dialog"). Pass `active: false` while the dialog is unmounted so a
// parent can keep the hook at its top level and only flip it on.

import { useEffect, useRef, type RefObject } from "react";
import { focusableWithin, trapTab } from "@/lib/a11y/keyboard";

export interface UseModalDialogOptions {
  /** False while the dialog is not rendered. Default true. */
  active?: boolean;
  onClose: () => void;
  /** Where to put focus first — a selector inside the dialog. Default: first tabbable element. */
  initialFocus?: string;
}

export function useModalDialog<T extends HTMLElement = HTMLDivElement>(
  ref: RefObject<T | null>,
  { active = true, onClose, initialFocus }: UseModalDialogOptions,
): void {
  // Latest onClose without re-running the trap effect when the parent re-renders.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const opener = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;

    if (!root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
    const target =
      (initialFocus ? root.querySelector<HTMLElement>(initialFocus) : null) ?? focusableWithin(root)[0] ?? root;
    // Let the browser paint first so the focus ring lands on a visible node.
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => target.focus()) : null;
    if (raf === null) target.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      trapTab(e, root);
    };
    root.addEventListener("keydown", onKey);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      root.removeEventListener("keydown", onKey);
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, [active, ref, initialFocus]);
}

export default useModalDialog;
