import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { JOURNEY_VOCAB_VERSION } from "@/lib/journey-vocabulary";

export const metadata: Metadata = {
  title: "BlockID Platform Docs — Plans, Audits, and the Multi-Agent Workflow",
  description:
    "Public entry point to BlockID.au platform documentation — plan deltas, workflow audits, and the canonical journey vocabulary that keeps 17 AI-agent C-Levels on the same page.",
  alternates: {
    canonical: "https://blockid.au/docs",
  },
};

// ---------------------------------------------------------------------------
// Recently-updated plan/audit docs. Update on deploy.
// ---------------------------------------------------------------------------

type DocEntry = {
  slug: string;
  title: string;
  updated: string;
  summary: string;
};

const RECENTLY_UPDATED_DOCS: DocEntry[] = [
  {
    slug: "docs/plans/real-world-workflow-parity-audit-2026-07-23.md",
    title: "Real-World Workflow Parity Audit (2026-07-23)",
    updated: "2026-07-23",
    summary:
      "Audits every surface, taxonomy, and data-room checklist against real Atlassian, Canva, Airwallex, Xero, and Culture Amp journeys — the seed for the canonical 8-stage journey vocabulary.",
  },
  {
    slug: "docs/plans/plan-delta-2026-07-23.md",
    title: "Reseller Module Plan Delta (2026-07-23)",
    updated: "2026-07-23",
    summary:
      "Consolidates 20 blocking findings from CTO, CFO, CISO, and CLO into concrete plan-file amendments; P1 migrations 0091+ stay blocked until every blocker returns allow.",
  },
];

const WORKFLOW_DOCS: DocEntry[] = [
  {
    slug: "docs/plans/reseller-module-plan.md",
    title: "Reseller Module Plan",
    updated: "in-flight",
    summary:
      "The active P10 reseller wire-shape and admin-surface programme; each tick lands one pin, mirrored across admin-resellers-list and admin-reseller-detail.",
  },
  {
    slug: "docs/plans/reseller-module-goal.md",
    title: "Reseller Module Goal",
    updated: "in-flight",
    summary:
      "Goal-state definition and acceptance gates for the reseller programme — used by the COO loop to decide when a phase is complete.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-4xl px-6">
          {/* Hero */}
          <div className="text-center mb-14">
            <p className="text-sm uppercase tracking-[0.15em] text-brand-600 font-medium mb-3">
              Platform docs
            </p>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-ink-900 leading-tight">
              How the{" "}
              <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
                multi-agent workflow
              </span>{" "}
              stays coherent
            </h1>
            <p className="mt-6 text-base md:text-lg leading-relaxed text-ink-600 max-w-2xl mx-auto">
              Every C-Level agent ships against the same canonical journey
              vocabulary and the same active plan. This page indexes the plan
              deltas, audits, and reference material that keep the fleet on the
              same page.
            </p>
          </div>

          {/* Recently updated */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Recently updated docs
            </h2>
            <p className="text-sm text-ink-600 mb-6">
              Freshly-committed audits and plan deltas that reset the fleet
              context this cycle.
            </p>
            <ul className="space-y-3">
              {RECENTLY_UPDATED_DOCS.map((doc) => (
                <li
                  key={doc.slug}
                  className="rounded-xl border border-surface-200 bg-surface-50 p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
                    <p className="text-base font-semibold text-ink-800">
                      {doc.title}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-ink-500">
                      updated {doc.updated}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-600 mb-2">
                    {doc.summary}
                  </p>
                  <p className="text-[11px] font-mono text-ink-400 break-all">
                    {doc.slug}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* In-flight workflow docs */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Active workflow plans
            </h2>
            <p className="text-sm text-ink-600 mb-6">
              The plan files the autonomous loop reads on every tick.
            </p>
            <ul className="space-y-3">
              {WORKFLOW_DOCS.map((doc) => (
                <li
                  key={doc.slug}
                  className="rounded-xl border border-surface-200 bg-surface-50 p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
                    <p className="text-base font-semibold text-ink-800">
                      {doc.title}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-ink-500">
                      {doc.updated}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-600 mb-2">
                    {doc.summary}
                  </p>
                  <p className="text-[11px] font-mono text-ink-400 break-all">
                    {doc.slug}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* Canonical vocab */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Canonical journey vocabulary
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              The 8-stage journey ratified in the parity audit — Idea,
              Validation, MVP / Early Revenue, Seed, Series A, Series B/C,
              Late-stage, Public / Exit. Every surface (roadmap, guide,
              reports) is being migrated onto this vocabulary; four legacy
              taxonomies are being retired.
            </p>
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-5">
              <p className="text-xs uppercase tracking-wider text-ink-500 mb-2">
                Module reference
              </p>
              <p className="text-sm font-mono text-ink-700 break-all">
                web/src/lib/journey-vocabulary.ts (v
                {JOURNEY_VOCAB_VERSION})
              </p>
              <p className="text-xs text-ink-500 mt-2">
                Consumed by <code>/roadmap</code>, <code>/guide</code>,
                report renderers, and the SVI stage mapper via{" "}
                <code>sviStageToCanonical()</code>.
              </p>
            </div>
          </section>

          {/* Related surfaces */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">
              Related surfaces
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Link
                href="/team"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /team
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  17 AI-agent C-Levels and their most recent shipped
                  contribution.
                </p>
              </Link>
              <Link
                href="/roadmap"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /roadmap
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  The 8-stage platform roadmap with per-stage entry and exit
                  criteria.
                </p>
              </Link>
              <Link
                href="/developers"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /developers
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Developer platform, API endpoints, and integration reference.
                </p>
              </Link>
              <Link
                href="/changelog"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /changelog
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Human-readable release notes tied to the autonomous ship
                  cadence.
                </p>
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
