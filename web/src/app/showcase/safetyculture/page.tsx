// /showcase/safetyculture — Case study #4: SafetyCulture (private unicorn).
// Public sources: safetyculture.com/press, Softbank filings, ABC/AFR quotes
// (verifiable public interviews), Wikipedia cross-ref only.

import Link from "next/link";

import { CanonicalStageBadge } from "@/components/showcase/canonical-stage-badge";
import {
  SAFETYCULTURE_TIMELINE,
  type Milestone as SharedMilestone,
} from "@/lib/startup-package/case-study-milestones";
import { GROWTH_PHASE_IDS } from "@/lib/journey-map";

export const dynamic = "force-dynamic";

// Renderer-local shape — sourced from the shared timeline module but
// re-projected onto the numeric-phase axis this page's grouping still uses.
interface Milestone {
  year: number | string;
  phase: number;
  headline: string;
  detail: string;
  source: string;
  usd?: string;
}

function toLegacyMilestone(m: SharedMilestone): Milestone {
  const idx = GROWTH_PHASE_IDS.indexOf(m.phase);
  return {
    year: m.year ?? "",
    phase: idx >= 0 ? idx + 1 : 1,
    headline: m.headline,
    detail: m.detail,
    source: m.source ?? "",
    usd: m.usd,
  };
}

const PHASE_NAMES: Record<number, string> = {
  1: "Vision / Day-0 Idea",
  2: "Idea Validation",
  3: "Market Research",
  4: "MVP / Product Discovery",
  5: "PMF / Early Traction",
  6: "Revenue / Business Model",
  7: "Growth / Analytics",
  8: "Team & Culture",
  9: "Funding-Ready",
  10: "Fundraise / Term Sheet",
  11: "Post-Funding / Growth Scale",
  12: "Exit / Beyond",
};

const TIMELINE: Milestone[] = SAFETYCULTURE_TIMELINE.map(toLegacyMilestone);

export default function SafetyCultureShowcasePage() {
  const byPhase = new Map<number, Milestone[]>();
  for (const m of TIMELINE) {
    if (!byPhase.has(m.phase)) byPhase.set(m.phase, []);
    byPhase.get(m.phase)!.push(m);
  }
  const phaseOrder = Array.from(byPhase.keys()).sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-5xl p-6">
        <nav className="mb-4 text-sm">
          <Link href="/showcase" className="text-brand-700 hover:underline">
            ← Showcase library
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="text-3xl font-semibold text-ink-900">SafetyCulture</h1>
          <p className="mt-1 text-sm text-ink-500">
            🇦🇺 Townsville / Sydney · Private · Founded 2004 · ~US$2.7B peak
            valuation · Luke Anear (ex-Private Investigator)
          </p>
          <p className="mt-3 max-w-3xl text-base text-ink-700">
            Luke Anear built SafetyCulture from Townsville — one of the few
            Australian tech unicorns not founded in Sydney or Melbourne.
            iAuditor replaces paper safety checklists at industrial worksites
            with a mobile app freemium model. 12 years bootstrapped then a
            Series A → C → Softbank Vision Fund arc that peaked at
            US$2.7B. This case study is the "regional Aussie founder,
            long-bootstrap, private-unicorn" story.
          </p>
        </header>

        <section className="mb-8 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-900">
            <strong>Skeleton case study.</strong> Full research brief queued
            for autonomous production by goal loop. Sources: safetyculture.com
            press releases + Softbank filings + verifiable public founder
            interviews. Every dollar figure will be re-cited from primary
            sources on the next research pass.
          </p>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-4">
          <Stat label="Founded" value="2004" hint="Townsville, Queensland" />
          <Stat label="Bootstrap years" value="12" hint="2004 → 2016 Series A" />
          <Stat label="Peak valuation" value="US$2.7B" hint="2022 Softbank round" />
          <Stat label="Status" value="Private" hint="Softbank + Insight portfolio" />
        </section>

        <section className="mb-8 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <h2 className="text-lg font-semibold text-brand-900">
            5 lessons for a BlockID.au founder (draft)
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-brand-900">
            <li>
              <strong>Regional-Aussie tech is possible.</strong> Townsville
              is 1400km north of Brisbane. Anear proves you don't need
              Sydney/Melbourne to scale. Fibre + remote-first + local hires
              built the foundation.
            </li>
            <li>
              <strong>12 years of bootstrap can be the right answer.</strong>{" "}
              Anear was not "raising too late" — he was building the market
              until the SaaS-industrial buyer emerged. Long-bootstrap fits
              category-creator startups.
            </li>
            <li>
              <strong>Freemium at physical worksites requires strong PLG
              instrumentation.</strong> iAuditor's freemium isn't just SaaS —
              it's used on scaffolding + factory floors. Instrumenting +
              measuring adoption in that context is a competitive moat.
            </li>
            <li>
              <strong>Softbank ≠ trap when growth is real.</strong>{" "}
              SafetyCulture's Softbank round was structured with achievable
              milestones. Not every founder needs to avoid Vision Fund — but
              you must be able to hit the growth curve implied.
            </li>
            <li>
              <strong>Valuation reset is a feature, not a bug.</strong>{" "}
              US$2.7B → US$2B secondary correction is healthy for the
              cap-table and lets employee options re-price. Founders who fear
              the reset stay overhung; those who plan for it recruit better.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-ink-900">
            Milestones by BlockID.au journey phase (draft)
          </h2>
          <div className="space-y-6">
            {phaseOrder.map((p) => (
              <div key={p} className="rounded-lg border border-surface-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-ink-900">
                    Phase {p} · {PHASE_NAMES[p]}
                  </h3>
                  <CanonicalStageBadge phase={p} />
                </div>
                <ul className="space-y-3">
                  {byPhase.get(p)!.map((m, i) => (
                    <li
                      key={`${p}-${i}`}
                      className="border-l-2 border-brand-300 pl-3 text-sm"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs text-ink-500">{m.year}</span>
                        <span className="font-semibold text-ink-900">{m.headline}</span>
                        {m.usd && (
                          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-800">
                            {m.usd}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-ink-700">{m.detail}</p>
                      <a
                        href={m.source}
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
          Full research brief (queued):{" "}
          <code className="rounded bg-surface-100 px-1">
            docs/usecases/safetyculture/USECASE.md
          </code>
          . Sources: safetyculture.com/press + Softbank filings + verifiable
          public interviews. No paywalled paraphrase (per docs/usecases/README.md
          §compliance).
        </footer>
      </div>
    </div>
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
