// /innovator — Corporate Innovator console overview.
//
// Greenfield per docs/plans/role-based-2026-07-25/innovator.md. Renders the
// role hero + 3 empty-state tiles pointing at Watchlist, Industry Map and
// Deal Pipeline. Uses `data-tour="innovator-*"` anchors so the
// `innovator-first-run` FeatureSpotlight can scroll each step into view.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, Layers, ListChecks, Radar } from "lucide-react";

import { RoleLandingIntro } from "@/components/role/role-landing-intro";
import { RoleNextStep } from "@/components/role/role-next-step";

export const metadata: Metadata = {
  title: "Innovator Console — BlockID",
  description:
    "Corporate scouting terminal for AU startups: thesis, industry map, watchlist and POC pipeline.",
  robots: { index: false, follow: false },
};

interface Tile {
  href: string;
  label: string;
  hint: string;
  emptyState: string;
  anchor: string;
  icon: typeof Radar;
}

const TILES: Tile[] = [
  {
    href: "/innovator/watchlist",
    label: "Watchlist",
    hint: "Track 30–80 startups you care about. Weekly digest lands here.",
    emptyState: "No startups tracked yet — add your first from the Industry Map.",
    anchor: "innovator-watchlist",
    icon: ListChecks,
  },
  {
    href: "/innovator/industry-map",
    label: "Industry Map",
    hint: "SVI leaderboard filtered by sector. Pin the 3 that match your thesis.",
    emptyState: "Pick a sector to see its top-decile startups.",
    anchor: "innovator-industry-map",
    icon: Radar,
  },
  {
    href: "/innovator/deal-pipeline",
    label: "Deal Pipeline",
    hint: "Kanban across Watchlist → Contacted → In Diligence → Deal.",
    emptyState: "No pipeline cards yet — promote a watchlist entry to get started.",
    anchor: "innovator-pipeline",
    icon: Layers,
  },
];

export default function InnovatorHomePage() {
  return (
    <div className="space-y-6">
      <RoleLandingIntro role="innovator">
        <Link
          href="/innovator/industry-map"
          className="inline-flex items-center gap-1 rounded-md border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:border-brand-700 dark:bg-surface-900 dark:text-brand-200"
        >
          <Compass className="h-3.5 w-3.5" aria-hidden />
          Skip tour, open Industry Map
        </Link>
      </RoleLandingIntro>

      <section
        data-tour="innovator-thesis"
        className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-surface-50 p-5 dark:border-brand-800/40 dark:from-brand-950/30 dark:via-surface-900 dark:to-surface-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
              Your innovation thesis
            </h2>
            <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">
              Define up to 3 strategic themes — e.g. "AI in logistics", "climate
              fintech", "B2B SaaS under $5M ARR" — and the Industry Map will
              pre-filter results to match, while your watchlist digest highlights
              the startups that move the needle on each theme.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
            Coming soon
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Link
            href="/founding-50"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Join Founding 50 for early access
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </section>

      <section
        aria-label="Console tiles"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            data-tour={tile.anchor}
            className="group rounded-2xl border border-surface-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-surface-700 dark:bg-surface-900 dark:hover:border-brand-700 dark:hover:bg-brand-950/30"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              <tile.icon className="h-4.5 w-4.5" aria-hidden />
            </span>
            <h3 className="mt-3 text-base font-semibold text-ink-900 dark:text-ink-50">
              {tile.label}
            </h3>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{tile.hint}</p>
            <p className="mt-3 rounded-md border border-dashed border-surface-300 bg-surface-50 px-3 py-2 text-xs italic text-ink-500 dark:border-surface-700 dark:bg-surface-800/60">
              {tile.emptyState}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 group-hover:underline dark:text-brand-300">
              Open <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </Link>
        ))}
      </section>

      <div
        data-tour="innovator-reports"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <div className="sm:col-span-2">
          <RoleNextStep role="innovator" />
        </div>
        <div className="rounded-xl border border-surface-200 bg-white/60 p-4 text-xs text-ink-500 dark:border-surface-700 dark:bg-surface-900/60">
          <p className="font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
            Board pack export
          </p>
          <p className="mt-2 text-ink-600 dark:text-ink-400">
            Ventures Quarterly PDF — assembled from live pipeline and watchlist
            data — is part of the full Innovator Console launch.
          </p>
          <Link
            href="/founding-50"
            className="mt-3 inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300"
          >
            Get early access <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
