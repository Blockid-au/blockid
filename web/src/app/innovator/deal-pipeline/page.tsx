// /innovator/deal-pipeline — kanban board for POC / partnership flow (stub).
//
// TODO: no backend yet. Once `innovator_pipeline_cards` (id, project_id,
// stage, owner_teammate, moved_at) lands (see innovator.md § Implementation
// notes) the columns render live cards and support drag-and-drop across
// stages. Anchor `innovator-pipeline` matches the first-run tour.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";

import { RoleNextStep } from "@/components/role/role-next-step";

export const metadata: Metadata = {
  title: "Deal Pipeline — Innovator Console — BlockID",
  robots: { index: false, follow: false },
};

interface Lane {
  id: string;
  title: string;
  helper: string;
  tone: string;
}

const LANES: Lane[] = [
  {
    id: "watchlist",
    title: "Watchlist",
    helper: "Tracked but not contacted.",
    tone: "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40",
  },
  {
    id: "contacted",
    title: "Contacted",
    helper: "Intro sent · awaiting reply.",
    tone: "border-blue-200 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-950/30",
  },
  {
    id: "diligence",
    title: "In Diligence",
    helper: "Data-room review + POC scoping.",
    tone: "border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/30",
  },
  {
    id: "deal",
    title: "Deal",
    helper: "POC live · contract signed.",
    tone: "border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/30",
  },
];

export default function InnovatorDealPipelinePage() {
  return (
    <div className="space-y-6">
      <header data-tour="innovator-pipeline">
        <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          <Layers className="h-4 w-4" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Deal Pipeline
          </span>
        </div>
        <h2 className="mt-1 text-xl font-semibold text-ink-900 dark:text-ink-50">
          POC and partnership flow
        </h2>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          Drag startups across the four stages. Board packs at{" "}
          <Link href="/innovator" className="text-brand-700 underline dark:text-brand-300">
            Innovator home
          </Link>{" "}
          summarise this pipeline every quarter.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LANES.map((lane) => (
          <section
            key={lane.id}
            aria-label={lane.title}
            className={`rounded-2xl border p-4 ${lane.tone}`}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                {lane.title}
              </h3>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 dark:bg-surface-900/60">
                0
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-500">{lane.helper}</p>

            <div className="mt-3 rounded-lg border border-dashed border-surface-300 bg-white/70 p-4 text-center text-xs italic text-ink-500 dark:border-surface-700 dark:bg-surface-900/40">
              No cards in {lane.title}
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/innovator/watchlist"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Promote from Watchlist
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
        <p className="text-xs text-ink-500">
          Backend TODO — <code className="rounded bg-surface-100 px-1 py-0.5 text-[11px] dark:bg-surface-800">innovator_pipeline_cards</code>{" "}
          table + <code className="rounded bg-surface-100 px-1 py-0.5 text-[11px] dark:bg-surface-800">POST /api/innovator/pipeline</code>{" "}
          route not yet shipped.
        </p>
      </div>

      <RoleNextStep role="innovator" />
    </div>
  );
}
