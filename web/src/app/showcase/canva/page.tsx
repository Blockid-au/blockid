// /showcase/canva — Case study #2: Canva (private decacorn).
// Research: docs/showcase/canva/RESEARCH.md (queued for autonomous fill by
// the goal loop; this page is a skeleton with a small set of well-known
// public facts as a starting point).

import Link from "next/link";

import { CanonicalStageBadge } from "@/components/showcase/canonical-stage-badge";

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
    year: 2007,
    phase: 1,
    headline: "Fusion Yearbooks — the precursor",
    detail:
      "Melanie Perkins and Cliff Obrecht start a school-yearbook design business in Perth. Learn the design-tool pain point that becomes Canva five years later.",
    source: "https://en.wikipedia.org/wiki/Canva",
  },
  {
    year: 2012,
    phase: 4,
    headline: "Canva incorporates in Sydney; Cameron Adams joins as CTO/co-founder",
    detail:
      "Perkins + Obrecht + Adams. 100+ investor rejections in Silicon Valley. Bill Tai finally introduces Perkins to Lars Rasmussen (ex-Google Maps).",
    source: "https://www.canva.com/newsroom/news/canva-turns-10/",
  },
  {
    year: 2013,
    phase: 10,
    headline: "US$3M seed round; product launched",
    detail:
      "Matrix Partners + Blackbird Ventures + Bill Tai + Lars Rasmussen. Canva.com launches to public on 2013-08-26 with 50,000 sign-ups within the first month.",
    source: "https://www.crunchbase.com/organization/canva/company_financials",
    usd: "$3M",
  },
  {
    year: 2015,
    phase: 11,
    headline: "US$15M Series A led by Sequoia's Bond + Felicis + Blackbird",
    detail:
      "Valuation ~US$165M. Canva Business launched. Canva for Work becomes revenue engine.",
    source: "https://www.crunchbase.com/organization/canva/company_financials",
    usd: "$15M",
  },
  {
    year: 2018,
    phase: 11,
    headline: "Unicorn status — US$1B valuation",
    detail:
      "US$40M round led by Sequoia China + Blackbird Ventures + Felicis. First Aussie-founded unicorn led by a female founder.",
    source: "https://www.canva.com/newsroom/",
    usd: "$1B valuation",
  },
  {
    year: 2019,
    phase: 11,
    headline: "US$70M @ US$2.5B; then US$85M @ US$3.2B",
    detail:
      "Two rounds in a year. Rapid international expansion; Manila office grows; Chinese market entry.",
    source: "https://www.canva.com/newsroom/",
    usd: "$2.5B → $3.2B",
  },
  {
    year: 2021,
    phase: 11,
    headline: "US$200M round; valuation US$40B (decacorn)",
    detail:
      "T. Rowe Price + Franklin Templeton + Sequoia Capital Global Equities + Bessemer Venture Partners. Perkins + Obrecht pledge 30% of their equity to charitable causes.",
    source: "https://www.canva.com/newsroom/news/canva-reaches-40-billion-valuation-signs-giving-pledge/",
    usd: "$40B valuation",
  },
  {
    year: 2022,
    phase: 11,
    headline: "Downround to US$26B in secondary market",
    detail:
      "As tech valuations reset globally, secondary trades reprice Canva. Primary financing remains intact.",
    source: "https://en.wikipedia.org/wiki/Canva",
    usd: "$26B",
  },
  {
    year: 2023,
    phase: 11,
    headline: "Magic Studio — AI product launch",
    detail:
      "Suite of generative AI features (Magic Design, Magic Media, Magic Write) built on partnerships with OpenAI, Google Cloud, Anthropic.",
    source: "https://www.canva.com/newsroom/news/canva-2023-year-in-review/",
  },
  {
    year: 2024,
    phase: 11,
    headline: "US$380M secondary at ~US$26B; Affinity acquisition US$380M",
    detail:
      "Affinity (Serif Ltd) UK-based Photoshop/Illustrator alternative acquired. Largest Canva deal to date; broadens pro-designer market.",
    source: "https://www.canva.com/newsroom/",
    usd: "$380M deal",
  },
  {
    year: 2025,
    phase: 12,
    headline: "IPO speculation intensifies as revenue passes US$3B ARR",
    detail:
      "Multiple press reports on 2025-26 IPO planning; investment banks engaged. Company publicly declines to confirm timing.",
    source: "https://en.wikipedia.org/wiki/Canva",
  },
];

export default function CanvaShowcasePage() {
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
          <h1 className="text-3xl font-semibold text-ink-900">Canva</h1>
          <p className="mt-1 text-sm text-ink-500">
            🇦🇺 Sydney · Private · Founded 2012 · ~US$40B peak valuation ·
            Perkins / Obrecht / Adams co-founders
          </p>
          <p className="mt-3 max-w-3xl text-base text-ink-700">
            Melanie Perkins pitched 100+ Silicon Valley investors and heard no
            before securing US$3M seed in 2013. A decade later, Canva is
            Australia's most valuable private tech company — a decacorn built
            product-first, with founders retaining substantial ownership
            through nine private rounds. The Canva journey shows how a
            second-time founder converts one rejection cycle into a global
            SaaS with growth capital instead of a traditional IPO track.
          </p>
        </header>

        <section className="mb-8 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-900">
            <strong>Skeleton case study.</strong> Detailed research brief with
            SEC-quality citations is queued for autonomous production by the
            goal loop (Track C.2). The timeline below uses well-known public
            facts as a starting point; each row will be replaced with a
            source-audited version.
          </p>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-4">
          <Stat label="Founded" value="2012" hint="Sydney" />
          <Stat label="Total raised" value="~US$600M" hint="9 rounds across seed → mega-secondaries" />
          <Stat label="Peak valuation" value="US$40B" hint="Sep 2021" />
          <Stat label="Current status" value="Private" hint="IPO speculation 2025-26" />
        </section>

        <section className="mb-8 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <h2 className="text-lg font-semibold text-brand-900">
            5 lessons for a BlockID.au founder (draft)
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-brand-900">
            <li>
              <strong>Idea validation via a precursor business.</strong>{" "}
              Fusion Yearbooks (2007-2012) taught the founders the design-tool
              pain point long before Canva incorporated. First-time founders
              underweight this "problem authority" step.
            </li>
            <li>
              <strong>Rejection is a filter, not a signal.</strong> 100+
              investor no's in Silicon Valley before the seed round. Bill Tai
              + Lars Rasmussen connection unlocked the round. Networks matter
              more than pitch quality at the very earliest stage.
            </li>
            <li>
              <strong>Growth capital, not IPO capital.</strong> 9 private
              rounds have kept optionality without the reporting overhead. In
              contrast to Atlassian's IPO-then-buyback pattern, Canva is
              running the "stay private, sell secondaries" playbook that
              Stripe + SpaceX also use.
            </li>
            <li>
              <strong>Valuation reset is normal.</strong> US$40B (2021) →
              US$26B (2022) secondary reprice was a headline event but did
              not reset primary financing terms. Founders that pre-commit
              secondary schedules avoid the "signal risk" of ad-hoc sales.
            </li>
            <li>
              <strong>M&A can be transformational late-stage.</strong> The
              Affinity acquisition (2024, US$380M) broadened Canva into
              pro-designer territory in one deal. BlockID.au's tokenisation
              + cap-table modules should model similar strategic M&A as a
              Phase 11-12 growth accelerator.
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
          <code className="rounded bg-surface-100 px-1">docs/showcase/canva/RESEARCH.md</code>
          . Autonomous goal loop will fill this once it schedules Track C.2.
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
