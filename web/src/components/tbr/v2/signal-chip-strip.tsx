"use client";

// G34 BT3 (D24-d) — the six investor signals as a STATUS chip row under the
// scorecard (spec §1 "Signal chip row"). No score until per-question scoring
// lands (G31 C12). Tapping / focusing a chip's button opens a small popover
// with the signal's fixed summary + its linked criteria titles (never a
// score) and a link to the expandable signal card in the investor-screening
// overview. Disclosure pattern: `<button aria-expanded aria-controls>`, Esc
// closes and returns focus to the chip, a click outside closes, one popover
// open at a time. The popover stays in the DOM (`hidden`) so the server
// render, the PDF and a no-JS reader still carry the card link. Free tier
// (D24-b): status visible, criteria gated by `buildInvestorScreening`
// (`criteria: []` when `detailLocked`).

import { useEffect, useRef, useState } from "react";
import type { DashboardV4, V4SignalChip } from "@/lib/report-v2/dashboard-v4";
import { cn } from "@/lib/utils";

const GLYPH: Record<V4SignalChip["status"], string> = { context_available: "◐", missing: "○", locked: "🔒" };

export type SignalPopoverAction = { type: "toggle"; key: string } | { type: "escape" } | { type: "outside" } | { type: "follow" };

/**
 * The popover state machine (pure — the workspace has no DOM test runner):
 * toggle opens one chip / closes the open one; Escape closes and names the
 * chip whose button takes focus back; a click outside or following the card
 * link closes without moving focus.
 */
export function signalPopoverReduce(open: string | null, action: SignalPopoverAction): { open: string | null; focus: string | null } {
  switch (action.type) {
    case "toggle":
      return { open: open === action.key ? null : action.key, focus: null };
    case "escape":
      return { open: null, focus: open };
    default:
      return { open: null, focus: null };
  }
}

export function SignalChipStrip({ v4, initialOpenKey = null }: { v4: DashboardV4; /** Server-render / test hook: a chip rendered open. */ initialOpenKey?: string | null }) {
  const s = v4.strings;
  const [openKey, setOpenKey] = useState<string | null>(initialOpenKey);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<Map<string, HTMLButtonElement>>(new Map());
  const dispatch = (action: SignalPopoverAction) => {
    const next = signalPopoverReduce(openKey, action);
    setOpenKey(next.open);
    if (next.focus) buttons.current.get(next.focus)?.focus();
  };

  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      const next = signalPopoverReduce(openKey, { type: "escape" });
      setOpenKey(next.open);
      if (next.focus) buttons.current.get(next.focus)?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setOpenKey(signalPopoverReduce(openKey, { type: "outside" }).open);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [openKey]);

  return (
    <div ref={rootRef} data-tbr-signal-chips className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.signalsTitle}</p>
      <ul className="flex flex-wrap gap-2">
        {v4.signalChips.map((chip) => {
          const open = openKey === chip.key;
          const popId = `tbr-signal-pop-${chip.key}`;
          return (
            <li key={chip.key} className="relative">
              <button
                type="button"
                ref={(el) => {
                  if (el) buttons.current.set(chip.key, el);
                  else buttons.current.delete(chip.key);
                }}
                aria-expanded={open}
                aria-controls={popId}
                title={chip.summary}
                data-tbr-signal-chip={chip.key}
                data-status={chip.status}
                onClick={() => dispatch({ type: "toggle", key: chip.key })}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs text-primary hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
                  chip.status === "missing" ? "border-dashed border-line" : "border-line-subtle",
                  open && "bg-surface-sunken",
                )}
              >
                <span aria-hidden="true" className={chip.status === "context_available" ? "text-action" : "text-muted"}>
                  {GLYPH[chip.status]}
                </span>
                <span className="font-medium">{chip.label}</span>
                <span className="text-muted">· {chip.statusLabel}</span>
              </button>
              <div
                id={popId}
                role="region"
                aria-label={s.signalPopoverAria(chip.label)}
                hidden={!open}
                data-tbr-signal-popover={chip.key}
                className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border border-line-subtle bg-surface p-3 text-xs text-secondary shadow-md print:hidden"
              >
                <p className="text-primary">{chip.summary}</p>
                {chip.detailLocked ? (
                  <p className="text-muted">{s.signalLockedDetail}</p>
                ) : chip.criteria.length > 0 ? (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-muted">{s.signalCriteria}</p>
                    <ul data-tbr-signal-criteria className="mt-1 list-disc space-y-0.5 pl-4">
                      {chip.criteria.map((title) => (
                        <li key={title}>{title}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted">{s.signalNoCriteria}</p>
                )}
                <a href={chip.href} onClick={() => dispatch({ type: "follow" })} className="inline-flex min-h-11 items-center font-medium text-action underline-offset-2 hover:underline">
                  {s.signalOpenCard} ›
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">{s.signalsNote}</p>
    </div>
  );
}
