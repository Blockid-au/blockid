"use client";

// SiteVisitorPanel — mocked Chromium frame that streams the crawler's
// live progress (address bar shows the current URL, counter renders
// pages fetched vs total, tech-stack chips light up as `tech_detect`
// events arrive).

import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, RefreshCw, Lock, Globe } from "lucide-react";

export interface SitePageFetch {
  url: string;
  status: "fetching" | "fetched" | "error";
  title?: string;
  ms?: number;
}

export interface SiteVisitorPanelProps {
  /** The seed URL (usually the origin). */
  seedUrl: string;
  /** Live-updating queue of visited pages. */
  pages: SitePageFetch[];
  /** Detected tech-stack chips (Next.js, Stripe, Cloudflare, etc.). */
  techStack: string[];
  /** Extracted content signals (headline, pricing, team, etc.). */
  signals?: string[];
  /** Estimated total pages. */
  totalPages?: number;
  className?: string;
}

export function SiteVisitorPanel({
  seedUrl,
  pages,
  techStack,
  signals = [],
  totalPages,
  className,
}: SiteVisitorPanelProps) {
  const fetchedCount = pages.filter((p) => p.status === "fetched").length;
  const current = pages.find((p) => p.status === "fetching") ?? pages[pages.length - 1];
  const displayUrl = current?.url ?? seedUrl;
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
                Preparing to crawl {seedUrl}…
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
