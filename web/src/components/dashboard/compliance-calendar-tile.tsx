"use client";

// ComplianceCalendarTile — read-only compliance-panel tile that consumes
// the JSON variant of /api/compliance/calendar (P1k) and surfaces the
// single next-up compliance deadline plus a "Subscribe" deep-link into
// /compliance/calendar so the founder can pipe every deadline into
// Google Calendar / iCal / Outlook without leaving the panel.
//
// Sits as the 8th slot in the CompliancePanel grid alongside the 7
// per-check tiles (ESIC / s708 / GST / R&D / WGEA / Modern Slavery /
// Tax Invoice history). Closes the P1k-nav tail-note
// ("dashboard tile pointer is a natural next tick under P1k-nav-tile").

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  pickCalendarTileView,
  type CalendarTileColour,
  type CalendarTilePayload,
} from "./compliance-calendar-tile.helpers";

const PILL_CLASS: Record<CalendarTileColour, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
};

export function ComplianceCalendarTile() {
  const [payload, setPayload] = React.useState<CalendarTilePayload | null>(
    null,
  );
  const [state, setState] = React.useState<"loading" | "ready" | "error">(
    "loading",
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/compliance/calendar?format=json", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setState("error");
          return;
        }
        const body = (await res.json()) as {
          ok?: boolean;
          total?: number;
          next_event?: CalendarTilePayload["next_event"];
          subscribe?: CalendarTilePayload["subscribe"];
        };
        if (cancelled) return;
        setPayload({
          total: body.total ?? 0,
          next_event: body.next_event ?? null,
          subscribe: body.subscribe ?? { webcal: "", https: "" },
        });
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const view = pickCalendarTileView(state === "loading" ? null : payload);

  return (
    <Link
      href="/compliance/calendar"
      data-testid="compliance-calendar-tile"
      data-colour={view.colour}
      data-total={payload?.total ?? 0}
      className="block rounded-xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {view.headline}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            .ics feed for BAS, ASIC, R&amp;D, WGEA, Modern Slavery
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0",
            PILL_CLASS[view.colour],
          )}
        >
          {view.chipLabel}
        </span>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        {state === "error"
          ? "Couldn't load the calendar — open /compliance/calendar to retry."
          : view.body}
      </div>
    </Link>
  );
}

export default ComplianceCalendarTile;
