// /showcase/xero — Case study #3: Xero (NZ/AU dual-listed SaaS accounting).
// Public sources: NZX filings, ASX 300 filings, xero.com/investors,
// Wikipedia (cross-ref only).

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
    year: 2006,
    phase: 1,
    headline: "Founded in Wellington by Rod Drury + Hamish Edwards",
    detail:
      "Drury (serial entrepreneur, sold AfterMail to Quest Software in 2006 for NZ$70M) + Edwards (accountant) build cloud-first accounting for SMBs. Original bet: browser-native replaces desktop MYOB.",
    source: "https://en.wikipedia.org/wiki/Xero_(company)",
  },
  {
    year: 2007,
    phase: 10,
    headline: "NZX IPO 6 months after founding — NZ$15M raised",
    detail:
      "Listed on NZX at NZ$1.00. Extraordinarily early IPO — pre-revenue. Justified by need for capital + credibility to compete with MYOB in AU.",
    source: "https://www.xero.com/nz/media-releases/",
    usd: "NZ$15M",
  },
  {
    year: 2010,
    phase: 11,
    headline: "Australian expansion — Sydney office",
    detail:
      "AU launch and dual-listing exploration begins. Sydney office established.",
    source: "https://www.xero.com/nz/media-releases/",
  },
  {
    year: 2012,
    phase: 11,
    headline: "ASX dual-listing — ASX code XRO",
    detail:
      "Xero listed on ASX as well as NZX. Both boards active until 2018 NZX delist.",
    source: "https://www.asx.com.au/asx/share-price-research/company/XRO",
  },
  {
    year: 2014,
    phase: 11,
    headline: "US expansion + Matrix Partners US$150M round",
    detail:
      "Matrix Capital + Accel + Peter Thiel $150M — valuation ~US$1.5B. Aggressive push into US SMB accounting market. Later described as loss-making chapter.",
    source: "https://en.wikipedia.org/wiki/Xero_(company)",
    usd: "$150M",
  },
  {
    year: 2016,
    phase: 11,
    headline: "1M subscribers milestone",
    detail: "Global subscriber base crosses 1M; ARR ~NZ$300M.",
    source: "https://www.xero.com/global/media-releases/",
  },
  {
    year: 2018,
    phase: 11,
    headline: "NZX delisting — ASX primary only",
    detail:
      "Xero delisted from NZX to simplify governance + reduce compliance overhead. ASX becomes sole listing (still cited as first NZ-to-AU dual-listing success).",
    source: "https://www.xero.com/global/media-releases/",
  },
  {
    year: 2019,
    phase: 11,
    headline: "Acquires Instafile + Hubdoc — data-capture bet",
    detail:
      "Doubles down on the accountant tool-chain around Xero — receipts, expenses, doc management.",
    source: "https://www.xero.com/global/media-releases/",
  },
  {
    year: 2020,
    phase: 11,
    headline: "Reaches profitability + 2.7M subscribers",
    detail:
      "First full year profitable. ARR NZ$820M. Market cap ~AU$16B on ASX.",
    source: "https://www.asx.com.au/asx/share-price-research/company/XRO",
  },
  {
    year: 2022,
    phase: 11,
    headline: "Steve Vamos steps down; Sukhinder Singh Cassidy CEO",
    detail:
      "First externally-hired CEO from Silicon Valley — signals move to US-market focus + AI product bets.",
    source: "https://www.xero.com/global/media-releases/",
  },
  {
    year: 2024,
    phase: 11,
    headline: "Cost-cutting + focus on ARR growth; 4.2M subscribers",
    detail:
      "Xero completes restructuring. Announces Xero AI (Just Ask Xero). Market cap ~AU$25B.",
    source: "https://www.xero.com/global/media-releases/",
  },
];

export default function XeroShowcasePage() {
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
          <h1 className="text-3xl font-semibold text-ink-900">Xero</h1>
          <p className="mt-1 text-sm text-ink-500">
            🇳🇿🇦🇺 Wellington / Melbourne · ASX: XRO · Founded 2006 · NZX
            IPO 2007 · Market cap ~AU$25B (2024)
          </p>
          <p className="mt-3 max-w-3xl text-base text-ink-700">
            Rod Drury sold his previous startup then bootstrapped Xero for
            just six months before listing on the NZX — an unusually early
            IPO used as a marketing + credibility weapon against MYOB. Xero
            proved that cloud-first accounting for SMBs works, dual-listed on
            ASX in 2012, and became the first NZ startup to redomicile its
            primary listing to Australia (delisted NZX 2018).
          </p>
        </header>

        <section className="mb-8 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-900">
            <strong>Skeleton case study.</strong> Full research brief queued
            for autonomous production by goal loop (Track C.3). Timeline uses
            well-known public facts; each row will be replaced with an
            source-audited version citing NZX + ASX filings + Xero
            investor-relations pages.
          </p>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-4">
          <Stat label="Founded" value="2006" hint="Wellington, NZ" />
          <Stat label="Time to IPO" value="6 months" hint="NZX Jun 2007" />
          <Stat label="Peak listings" value="2 (NZX+ASX)" hint="2012-2018" />
          <Stat label="Current market cap" value="~AU$25B" hint="ASX:XRO 2024" />
        </section>

        <section className="mb-8 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <h2 className="text-lg font-semibold text-brand-900">
            5 lessons for a BlockID.au founder (draft)
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-brand-900">
            <li>
              <strong>Second-time founder can IPO ridiculously early.</strong>{" "}
              Drury had proven exit history from AfterMail — the market gave
              Xero benefit of the doubt at 6 months pre-revenue. NZX is
              friendlier for early-stage listings than ASX.
            </li>
            <li>
              <strong>Dual-listing costs eventually outweigh benefits.</strong>{" "}
              Xero maintained NZX + ASX for 6 years then delisted NZX.
              Compliance duplication + no unique NZX liquidity meant single
              exchange won.
            </li>
            <li>
              <strong>US expansion at any price is not always right.</strong>{" "}
              The 2014 US$150M round + aggressive US push was later described
              as capital-inefficient. AU/NZ + UK proved to be Xero's real
              markets.
            </li>
            <li>
              <strong>Cloud-first beats desktop-with-cloud.</strong> Xero
              was born browser-native; MYOB's desktop-plus-cloud never fully
              caught up. Same lesson: don't retrofit.
            </li>
            <li>
              <strong>Founder → external CEO transition when the growth
              curve requires it.</strong> Drury handed off to Steve Vamos then
              to Sukhinder Singh Cassidy. Founder-CEO tenure ended at
              billions in revenue.
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
          <code className="rounded bg-surface-100 px-1">docs/usecases/xero/USECASE.md</code>
          . Autonomous goal loop will fill this once it schedules Track C.3.
          Sources: NZX + ASX filings + xero.com investor-relations pages.
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
