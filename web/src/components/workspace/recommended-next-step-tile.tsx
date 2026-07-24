"use client";

// Sidebar-pinned tile that surfaces exactly ONE most-relevant next step for
// the current session. Fetches `/api/nudge/next-steps` on mount (see
// atlassian-standard-mapping-goal.md §3) and falls back to the pure
// phase-map recommender when the API is unavailable or returns no
// `next_action`.
//
// Renders: sparkle icon, one-line title, one-line reason
// ("Because you're at Phase N: …"), single primary CTA button that
// links to the recommended href. Emits GA4 event `nav.rec_next_step.click`
// when the CTA is pressed. Includes `data-testid="rec-next-step"`.
//
// The tile is intentionally tiny (single row on collapsed sidebar, three
// short lines when expanded) so it doesn't push the pillar headers below
// the fold on 13" laptops.

import * as React from "react";
import Link from "next/link";
import {
  Sparkles, FileText, BarChart3, Target, Banknote, PieChart, TrendingUp,
  Map, Rocket, DoorOpen, Layers, Users, Handshake,
  type LucideIcon,
} from "lucide-react";

import {
  recommendNextStep,
  reasonForPhase,
  type RecommendedNextStep,
} from "@/lib/nav/next-step-recommender";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<RecommendedNextStep["icon"], LucideIcon> = {
  sparkles: Sparkles,
  "file-text": FileText,
  "bar-chart": BarChart3,
  target: Target,
  banknote: Banknote,
  "pie-chart": PieChart,
  "trending-up": TrendingUp,
  map: Map,
  rocket: Rocket,
  "door-open": DoorOpen,
  layers: Layers,
  users: Users,
  handshake: Handshake,
};

interface Props {
  currentPhase: number;
  planId?: string | null;
  segment?: string | null;
  /** When collapsed we show icon-only to keep the sidebar narrow. */
  sidebarOpen?: boolean;
}

interface RemoteAction {
  title: string;
  reason: string;
  cta_url: string;
  cta_label: string;
}

export function RecommendedNextStepTile({
  currentPhase,
  planId,
  segment,
  sidebarOpen = true,
}: Props) {
  // Compute the offline fallback synchronously so the tile has content on
  // the very first paint — the API is a progressive enhancement.
  const fallback = React.useMemo(
    () => recommendNextStep({ currentPhase, planId, segment }),
    [currentPhase, planId, segment],
  );

  const [remote, setRemote] = React.useState<RemoteAction | null>(null);
  const [errored, setErrored] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/nudge/next-steps", {
          method: "GET",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(`nudge_${res.status}`);
        const json = (await res.json()) as {
          ok?: boolean;
          result?: { next_action?: RemoteAction };
        };
        const action = json?.result?.next_action;
        if (cancelled) return;
        if (action && action.cta_url && action.title) {
          setRemote(action);
        }
      } catch {
        if (!cancelled) setErrored(true);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // Prefer the remote next_action when it's present; otherwise the pure
  // fallback keeps the tile useful.
  const href = remote?.cta_url ?? fallback.href;
  const title = remote?.title ?? fallback.label;
  const ctaLabel = remote?.cta_label ?? fallback.ctaLabel;
  const reason = remote?.reason ?? reasonForPhase(currentPhase);
  const Icon = ICON_MAP[fallback.icon] ?? Sparkles;

  const handleClick = React.useCallback(() => {
    // Fire GA4 event non-blocking; guard against no-analytics envs.
    if (typeof window === "undefined") return;
    try {
      const w = window as unknown as {
        gtag?: (cmd: string, name: string, params: Record<string, unknown>) => void;
        dataLayer?: Array<Record<string, unknown>>;
      };
      const payload = {
        event: "nav.rec_next_step.click",
        current_phase: currentPhase,
        plan_id: planId ?? null,
        segment: segment ?? null,
        href,
        source: remote ? "api" : (errored ? "fallback_error" : "fallback_default"),
      };
      w.gtag?.("event", "nav.rec_next_step.click", payload);
      if (Array.isArray(w.dataLayer)) w.dataLayer.push(payload);
    } catch {
      /* analytics is best-effort */
    }
  }, [currentPhase, planId, segment, href, remote, errored]);

  if (!sidebarOpen) {
    // Collapsed sidebar — icon-only pill.
    return (
      <Link
        href={href}
        data-testid="rec-next-step"
        onClick={handleClick}
        title={`${title} — ${reason}`}
        className="mx-2 mt-3 flex h-9 w-9 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors dark:bg-brand-900/20 dark:text-brand-100"
      >
        <Icon strokeWidth={1.75} className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <div
      data-testid="rec-next-step"
      className="mx-3 mt-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm dark:bg-brand-900/20"
    >
      <div className="flex items-start gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-800/50 dark:text-brand-100">
          <Icon strokeWidth={1.75} className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-brand-900 dark:text-brand-50">
            {title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-brand-700/80 dark:text-brand-100/70">
            {reason}
          </p>
        </div>
      </div>
      <Link
        href={href}
        onClick={handleClick}
        data-testid="rec-next-step-cta"
        className={cn(
          "mt-2 flex w-full items-center justify-center rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700",
        )}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
