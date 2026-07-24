// /showcase/atlassian — Case study #1: Atlassian (NASDAQ: TEAM).
// Research: docs/showcase/atlassian/RESEARCH.md (every claim cited).
// Track C goal item.
//
// The timeline data now lives in a typed fixture module so the sibling
// walkthrough pages (dashboard, svi-report, growth-phases, agents/[slug],
// data-room, valuation, guide, summary) share a single source of truth.
// See web/src/lib/showcase/atlassian/fixture.ts.

import Link from "next/link";

import { AtlassianWalkthroughProvider } from "@/components/showcase/atlassian-walkthrough-provider";
import { CanonicalStageBadge } from "@/components/showcase/canonical-stage-badge";
import {
  ATLASSIAN_DEMO,
  PHASE_DISPLAY_NAMES,
  groupMilestonesByPhase,
} from "@/lib/showcase/atlassian/fixture";

export const dynamic = "force-dynamic";

export default function AtlassianShowcasePage() {
  const grouped = groupMilestonesByPhase();

  return (
    <AtlassianWalkthroughProvider stepNumber={1}>
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-5xl p-6">
        <nav className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link href="/showcase" className="text-brand-700 hover:underline">
            ← Showcase library
          </Link>
          <Link
            href="/showcase/atlassian/dashboard?step=2"
            data-testid="start-walkthrough-cta"
            className="rounded-md border border-brand-500 bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Start walkthrough →
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="text-3xl font-semibold text-ink-900">
            {ATLASSIAN_DEMO.profile.name}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            🇦🇺 {ATLASSIAN_DEMO.profile.hqCity} · {ATLASSIAN_DEMO.profile.ticker} ·
            Founded {ATLASSIAN_DEMO.profile.foundedYear} · IPO 2015 · Market cap
            ~US$21.7B (Jul 2026)
          </p>
          <p className="mt-3 max-w-3xl text-base text-ink-700">
            Cannon-Brookes + Farquhar bootstrapped Jira on an A$10K credit card,
            skipped the classic Series A/B/C stack, took one Accel secondary
            (2010) + one T. Rowe Price secondary (2014), and IPO'd on NASDAQ
            with founders each holding ~37% and Class B retaining 96.7% of
            voting power. This is the canonical Australian bootstrap-to-unicorn
            journey.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-4">
          <Stat label="Bootstrap years" value="8" hint="2002 → 2010 zero VC" />
          <Stat label="Pre-IPO rounds" value="2 secondaries" hint="No primary VC ever" />
          <Stat label="Founders at IPO" value="~74%" hint="Class B voting" />
          <Stat label="Voting power today" value="~42.7%" hint="Cannon-Brookes 13G" />
        </section>

        <section className="mb-8 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <h2 className="text-lg font-semibold text-brand-900">
            5 lessons for a BlockID.au founder
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-brand-900">
            <li>
              <strong>Bootstrap-then-secondary preserves equity.</strong> Both
              pre-IPO rounds were 100% secondary (founder liquidity, not
              treasury) — the founders diluted zero.
            </li>
            <li>
              <strong>Dual-class + evergreen ESOP keep control at IPO.</strong>{" "}
              Class B (10 votes/share) held 96.7% voting despite economic
              minority. Requires UK Plc chassis or Delaware C-corp — ASX
              prohibits dual-class.
            </li>
            <li>
              <strong>Acquisitions = ~90% cash + ~10% retention equity.</strong>{" "}
              Trello, OpsGenie, Halp, Loom all followed this pattern. No mega-
              stock deals — refuse to dilute Class B.
            </li>
            <li>
              <strong>Product-led growth ≥ sales-led for a dev buyer.</strong>{" "}
              First US$100M revenue with essentially no sales team. President
              of Sales only hired 9 years in.
            </li>
            <li>
              <strong>Sequence governance progressively.</strong> Start with 3
              of 5 board independent, no sunset provision. Harden post-IPO with
              independent Chair, 3 standing committees, ex-LinkedIn CFO chairing
              Audit.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-ink-900">
            Milestones by BlockID.au journey phase
          </h2>
          <div className="space-y-6">
            {grouped.map(({ phase, milestones }) => (
              <div key={phase} className="rounded-lg border border-surface-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-ink-900">
                    Phase {phase} · {PHASE_DISPLAY_NAMES[phase]}
                  </h3>
                  <CanonicalStageBadge phase={phase} />
                </div>
                <ul className="space-y-3">
                  {milestones.map((m, i) => (
                    <li
                      key={`${phase}-${i}`}
                      className="border-l-2 border-brand-300 pl-3 text-sm"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs text-ink-500">
                          {m.date ?? m.year}
                        </span>
                        <span className="font-semibold text-ink-900">{m.title}</span>
                        {m.usd && (
                          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-800">
                            {m.usd}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-ink-700">{m.body}</p>
                      <a
                        href={m.source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-[11px] text-brand-700 hover:underline"
                      >
                        source →
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-8 text-xs text-ink-500">
          Full research brief with every source citation:{" "}
          <code className="rounded bg-surface-100 px-1">
            docs/showcase/atlassian/RESEARCH.md
          </code>
          . Compiled 2026-07-21 from 3 parallel research subagents. Every dollar
          figure has a live URL.
        </footer>
      </div>
    </div>
    </AtlassianWalkthroughProvider>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
    </div>
  );
}
