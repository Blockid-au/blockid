"use client";

// SiteVisitorPanel — mocked Chromium frame that streams the crawler's
// live progress (address bar shows the current URL, counter renders
// pages fetched vs total, tech-stack chips light up as `tech_detect`
// events arrive).
//
// Two modes:
//   1. Legacy — caller passes `pages` + `techStack` (used by tests and
//      any external SSE consumers).
//   2. `url` prop — the panel opens its own EventSource against
//      /api/site-crawl/stream?url=<url>, listens for the real events
//      (page_fetch / tech_detect / signal_extract / done / error) and
//      updates itself. Fires `onDone(intake)` with the caller's intake
//      once the stream closes.

import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, RefreshCw, Lock, Globe } from "lucide-react";
import type { IntakeResult } from "@/lib/intake/analyze-input";

export interface SitePageFetch {
  url: string;
  status: "fetching" | "fetched" | "error";
  title?: string;
  ms?: number;
}

export interface SiteVisitorPanelProps {
  /** The seed URL (usually the origin). Also used to open the SSE stream. */
  seedUrl?: string;
  /** Preferred: bare URL string to crawl live via /api/site-crawl/stream. */
  url?: string;
  /** Optional intake result to forward to onDone. */
  intake?: IntakeResult;
  /** Fired after the SSE stream closes (or errors). */
  onDone?: (intake?: IntakeResult) => void;
  /** Legacy — pre-built page list. */
  pages?: SitePageFetch[];
  /** Legacy — pre-built tech-stack list. */
  techStack?: string[];
  /** Extracted content signals (headline, pricing, team, etc.). */
  signals?: string[];
  /** Estimated total pages. */
  totalPages?: number;
  className?: string;
}

interface PageFetchEvent {
  url: string;
  title?: string;
  textLength?: number;
}
interface TechDetectEvent {
  url: string;
  techHints?: string[];
  audit?: { frameworks?: string[]; cms?: string[]; cdn?: string[] };
}
interface SignalExtractEvent {
  totalPages?: number;
  signals?: Record<string, unknown>;
}
interface DiscoveredEvent {
  count: number;
  urls: string[];
}

export function SiteVisitorPanel({
  seedUrl,
  url,
  intake,
  onDone,
  pages: pagesProp,
  techStack: techStackProp,
  signals: signalsProp,
  totalPages: totalPagesProp,
  className,
}: SiteVisitorPanelProps) {
  const effectiveSeed = url ?? seedUrl ?? "";
  const isLive = Boolean(url);

  const [livePages, setLivePages] = React.useState<SitePageFetch[]>([]);
  const [liveTech, setLiveTech] = React.useState<string[]>([]);
  const [liveSignals, setLiveSignals] = React.useState<string[]>([]);
  const [liveTotal, setLiveTotal] = React.useState<number | undefined>(undefined);
  const doneCalledRef = React.useRef(false);

  // ── Live SSE subscription ───────────────────────────────────────────
  React.useEffect(() => {
    if (!url) return;
    doneCalledRef.current = false;
    setLivePages([]);
    setLiveTech([]);
    setLiveSignals([]);
    setLiveTotal(undefined);

    const src = new EventSource(
      `/api/site-crawl/stream?url=${encodeURIComponent(url)}`,
    );

    const bumpTech = (hints: string[]) => {
      if (!hints || hints.length === 0) return;
      setLiveTech((prev) => {
        const next = new Set(prev);
        for (const h of hints) next.add(h);
        return Array.from(next);
      });
    };

    src.addEventListener("discovered", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as DiscoveredEvent;
        setLiveTotal((data.count ?? 0) + 1);
      } catch {
        /* ignore */
      }
    });

    src.addEventListener("page_fetch", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as PageFetchEvent;
        setLivePages((prev) => {
          const idx = prev.findIndex((p) => p.url === data.url);
          const entry: SitePageFetch = {
            url: data.url,
            status: "fetched",
            title: data.title,
          };
          if (idx < 0) return [...prev, entry];
          const next = prev.slice();
          next[idx] = { ...next[idx], ...entry };
          return next;
        });
      } catch {
        /* ignore */
      }
    });

    src.addEventListener("tech_detect", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as TechDetectEvent;
        if (data.techHints) bumpTech(data.techHints);
        if (data.audit) {
          const flat = [
            ...(data.audit.frameworks ?? []),
            ...(data.audit.cms ?? []),
            ...(data.audit.cdn ?? []),
          ];
          bumpTech(flat);
        }
      } catch {
        /* ignore */
      }
    });

    src.addEventListener("signal_extract", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as SignalExtractEvent;
        setLiveTotal(data.totalPages);
        const summarized: string[] = [];
        const s = data.signals ?? {};
        if (s.hasProduct) summarized.push("Product surface described");
        if (s.hasCustomers) summarized.push("Customer / logo evidence present");
        if (s.hasRevenue) summarized.push("Revenue or pricing signals detected");
        if (s.hasSocialProof) summarized.push("Testimonials or social proof found");
        if (s.hasAnalytics) summarized.push("Analytics stack detected");
        if (typeof s.sector === "string" && s.sector) {
          summarized.push(`Sector: ${s.sector}`);
        }
        setLiveSignals(summarized);
      } catch {
        /* ignore */
      }
    });

    const finish = () => {
      if (doneCalledRef.current) return;
      doneCalledRef.current = true;
      src.close();
      onDone?.(intake);
    };

    src.addEventListener("done", finish);
    src.addEventListener("error", () => {
      // EventSource fires "error" both for network failure and normal close.
      // Either way, hand control back to the caller so the flow can advance.
      finish();
    });

    return () => {
      src.close();
    };
  }, [url, intake, onDone]);

  // ── Pick which values to render ─────────────────────────────────────
  const pages = isLive ? livePages : pagesProp ?? [];
  const techStack = isLive ? liveTech : techStackProp ?? [];
  const signals = isLive ? liveSignals : signalsProp ?? [];
  const totalPages = isLive ? liveTotal : totalPagesProp;

  const fetchedCount = pages.filter((p) => p.status === "fetched").length;
  const current =
    pages.find((p) => p.status === "fetching") ?? pages[pages.length - 1];
  const displayUrl = current?.url ?? effectiveSeed;
  const total = totalPages ?? pages.length;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line-subtle bg-surface-raised p-3",
        className,
      )}
      data-testid="site-visitor-panel"
    >
      <header>
        <p className="text-xs uppercase tracking-[0.14em] text-tertiary">
          Site visitor
        </p>
        <p className="text-sm text-primary" data-testid="site-page-counter">
          {fetchedCount} of {total || "…"} pages fetched
        </p>
      </header>

      {/* Chrome-frame mock */}
      <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface">
        <div className="flex items-center gap-2 border-b border-line-subtle bg-surface-hover px-2 py-1.5">
          <div className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-bear" />
            <span className="h-2.5 w-2.5 rounded-full bg-warn" />
            <span className="h-2.5 w-2.5 rounded-full bg-bull" />
          </div>
          <button
            type="button"
            aria-label="back"
            className="p-1 text-tertiary"
            disabled
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="forward"
            className="p-1 text-tertiary"
            disabled
          >
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="reload"
            className="p-1 text-tertiary"
            disabled
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </button>
          <div className="flex flex-1 items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs text-secondary">
            <Lock className="h-3 w-3 text-bull" aria-hidden />
            <span className="truncate" data-testid="site-address-bar">
              {displayUrl}
            </span>
          </div>
        </div>
        <div className="px-3 py-2">
          <ul className="space-y-1 text-xs">
            {pages.length === 0 && (
              <li className="italic text-muted">
                Preparing to crawl {effectiveSeed}…
              </li>
            )}
            {pages.slice(-8).map((p) => (
              <li
                key={`${p.url}-${p.status}`}
                className={cn(
                  "flex items-center gap-2",
                  p.status === "fetched" && "text-primary",
                  p.status === "fetching" && "text-action",
                  p.status === "error" && "text-bear",
                )}
              >
                <Globe className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{p.url}</span>
                {typeof p.ms === "number" && (
                  <span className="ml-auto tabular-nums text-tertiary">
                    {p.ms}ms
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wider text-tertiary">
          Tech stack detected
        </p>
        <div className="flex flex-wrap gap-1.5">
          {techStack.length === 0 ? (
            <span className="text-xs italic text-muted">
              Nothing detected yet
            </span>
          ) : (
            techStack.map((t) => (
              <span
                key={t}
                className="rounded-full border border-line-subtle bg-surface px-2 py-0.5 text-[11px] text-primary"
                data-testid={`site-tech-${t.toLowerCase().replace(/\W/g, "-")}`}
              >
                {t}
              </span>
            ))
          )}
        </div>
      </div>

      {signals.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wider text-tertiary">
            Content signals
          </p>
          <ul className="space-y-0.5 text-xs text-secondary">
            {signals.slice(0, 5).map((s, i) => (
              <li key={`${s}-${i}`}>· {s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SiteVisitorPanel;
