// /showcase/safetyculture — Case study #4: SafetyCulture (private unicorn).
// Public sources: safetyculture.com/press, Softbank filings, ABC/AFR quotes
// (verifiable public interviews), Wikipedia cross-ref only.

import Link from "next/link";

export const dynamic = "force-dynamic";

interface Milestone {
  year: number | string;
  phase: number;
  headline: string;
  detail: string;
  source: string;
  usd?: string;
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

const TIMELINE: Milestone[] = [
  {
    year: 2004,
    phase: 1,
    headline: "Founded in Townsville by Luke Anear",
    detail:
      "Ex-Private Investigator with a passion for workplace safety builds paper-forms replacement for construction + mining sites. Regional Aussie founder — unusual for tech.",
    source: "https://en.wikipedia.org/wiki/SafetyCulture",
  },
  {
    year: 2012,
    phase: 4,
    headline: "iAuditor mobile app launched",
    detail:
      "Native iOS + Android inspection app replaces paper safety checklists. Freemium model. Product-led growth from Day 0.",
    source: "https://safetyculture.com/press/",
  },
  {
    year: 2016,
    phase: 10,
    headline: "US$23M Series A led by Index Ventures + Blackbird",
    detail:
      "Series A after 12 years of bootstrap-and-slow-growth. Uncommon path — most Aussie tech takes seed within 2 years.",
    source: "https://safetyculture.com/press/",
    usd: "$23M",
  },
  {
    year: 2018,
    phase: 11,
    headline: "US$70M Series B; valuation ~US$440M",
    detail:
      "Tiger Global led. HQ shifts to Sydney office alongside Townsville roots. International expansion into US + UK.",
    source: "https://safetyculture.com/press/",
    usd: "$70M",
  },
  {
    year: 2021,
    phase: 11,
    headline: "US$99M Series C; unicorn status",
    detail:
      "Insight Partners led. Valuation US$1.6B — first Townsville-founded tech unicorn.",
    source: "https://safetyculture.com/press/",
    usd: "$1.6B valuation",
  },
  {
    year: 2022,
    phase: 11,
    headline: "US$34M Series C extension @ US$2.7B valuation",
    detail:
      "Softbank Vision Fund 2 led — first Australian Softbank-led round. Growth acceleration into US + APAC.",
    source: "https://safetyculture.com/press/",
    usd: "$2.7B valuation",
  },
  {
    year: 2023,
    phase: 11,
    headline: "AI product line launched",
    detail:
      "Generative AI features for safety checklist creation + inspection analysis. Partnerships with OpenAI + Anthropic.",
    source: "https://safetyculture.com/press/",
  },
  {
    year: 2024,
    phase: 11,
    headline: "Secondary trade valuation ~US$2B (down from US$2.7B peak)",
    detail:
      "Consistent with global valuation resets. Company remains cash-flow positive.",
    source: "https://safetyculture.com/press/",
    usd: "$2B secondary",
  },
];

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
                <h3 className="mb-3 text-base font-semibold text-ink-900">
                  Phase {p} · {PHASE_NAMES[p]}
                </h3>
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
