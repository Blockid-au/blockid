import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";

const TITLE = "6 Startup Valuation Methods Explained (AU 2026) | BlockID";
const DESCRIPTION =
  "VC Method, DCF, Comparables, Berkus, Scorecard, Risk-Factor Summation — formulae, when to use, and Australian benchmarks. Free founder guide.";
const URL = "https://blockid.au/guides/valuation-methods";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "startup valuation methods",
    "berkus method formula",
    "scorecard valuation method",
    "vc method valuation",
    "risk factor summation",
    "dcf startup",
    "comparables method valuation",
    "australia startup valuation",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "article",
    url: URL,
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: URL,
  },
};

type Method = {
  slug: string;
  name: string;
  bestFor: string;
  formula: string;
  formulaNote: string;
  howItWorks: string;
  pros: string[];
  cons: string[];
  auContext: string;
};

const METHODS: Method[] = [
  {
    slug: "berkus",
    name: "Berkus Method",
    bestFor: "Pre-revenue / idea stage",
    formula:
      "Valuation = Σ (Pillar Score × AUD $500k cap), 5 pillars, max AUD $2.5M",
    formulaNote:
      "Pillars: (1) Sound idea, (2) Prototype, (3) Quality management team, (4) Strategic relationships, (5) Product rollout or sales.",
    howItWorks:
      "Award each pillar 0 – AUD $500k based on how well the startup demonstrates it. Sum the five to get a pre-money valuation ceiling of AUD $2.5M. Deliberately caps out to stop over-valuing zero-revenue ideas.",
    pros: [
      "Fast, defensible, no revenue required",
      "Investor-familiar in AU angel rounds",
      "Bounds the ceiling — prevents runaway idea-stage valuations",
    ],
    cons: [
      "Ceiling can be too low for sector outliers (deep tech, biotech)",
      "Weightings are equal — real weight varies by sector",
    ],
    auContext:
      "Aligned with typical AU angel / SAFE pre-money bands (AUD $1M – $3M) for pre-seed founders.",
  },
  {
    slug: "scorecard",
    name: "Scorecard (Bill Payne) Method",
    bestFor: "Pre-revenue with signal (deck, LOIs, MVP)",
    formula:
      "Valuation = Regional avg pre-money × Weighted score multiplier (0.5x – 1.5x)",
    formulaNote:
      "Factors + weights: Team (30%), Opportunity (25%), Product/Tech (15%), Competitive env (10%), Marketing/Sales (10%), Need for more capital (5%), Other (5%).",
    howItWorks:
      "Pick a regional average pre-money for the stage (AU seed ~AUD $3–5M). Score each factor vs. the average (0.5x below, 1.5x above), multiply by the weight, sum to get a total multiplier. Apply to the regional average.",
    pros: [
      "Sector- and geography-aware",
      "Combines qualitative signal with a market anchor",
      "Widely used by AU angel groups (Sydney Angels, Melbourne Angels)",
    ],
    cons: [
      "Regional averages age quickly — must be refreshed each quarter",
      "Weights are subjective and skew heavily to Team",
    ],
    auContext:
      "BlockID uses AU-refreshed regional averages by sector — see the /benchmarks page for the current base.",
  },
  {
    slug: "risk-factor-summation",
    name: "Risk-Factor Summation",
    bestFor: "Seed / pre-Series A with de-risking milestones",
    formula:
      "Valuation = Base × (1 + Σ risk adjustments), 12 factors × ±AUD $500k each",
    formulaNote:
      "Factors: Management, Stage, Legislation/Political, Manufacturing, Sales/Marketing, Funding, Competition, Technology, Litigation, International, Reputation, Potential exit.",
    howItWorks:
      "Start from a regional pre-money base. Score each of 12 risk factors from ++ (very low risk, +AUD $500k) to -- (very high risk, −AUD $500k). Add adjustments to the base to derive the valuation.",
    pros: [
      "Forces explicit conversation about each risk category",
      "Complements Scorecard — good triangulation input",
    ],
    cons: [
      "12 factors is heavy for a first raise",
      "Adjustment size (AUD $500k) is a rough default; adjust to sector",
    ],
    auContext:
      "Best paired with Scorecard when raising from AU family offices or later-stage angels who ask for risk-mitigation memos.",
  },
  {
    slug: "comparables",
    name: "Comparables (Market Multiples)",
    bestFor: "Revenue-generating (AUD $10k+ MRR)",
    formula:
      "Valuation = Revenue × Sector ARR multiple × AU stage discount",
    formulaNote:
      "Sector multiples (AU 2026): SaaS 6–10x ARR, Fintech 4–8x ARR, Marketplace 2–4x GMV, Deep tech 8–15x forward revenue.",
    howItWorks:
      "Pick 5–10 recent AU comparable raises in the same sector and stage. Compute the median revenue multiple. Apply a 0.7–0.9x AU discount vs. US comparables to reflect market liquidity. Multiply by the startup's revenue.",
    pros: [
      "Grounded in real-world transactions",
      "Investor-defensible — direct link to market",
    ],
    cons: [
      "Requires access to comparable deal data (often private)",
      "Multiples compress fast in downturns — must recheck monthly",
    ],
    auContext:
      "BlockID's cfo-valuation engine sources AU comparables from Cut Through Venture + AVCAL deal reports; see /benchmarks.",
  },
  {
    slug: "vc-method",
    name: "VC Method (Terminal Value)",
    bestFor: "Seed / Series A with a 5–7 year exit thesis",
    formula:
      "Pre-money = (Terminal value ÷ Target ROI) − Investment",
    formulaNote:
      "Terminal value = Exit-year revenue × Exit multiple. Target ROI = 10x–30x (angel/seed) reflecting 40–60% required IRR over 5–7 years.",
    howItWorks:
      "Project revenue at exit (year 5–7). Apply an exit multiple to get terminal value. Discount back by the target ROI to derive the post-money today, then subtract the round size for pre-money.",
    pros: [
      "Aligns founder + investor on the exit story",
      "Explicitly prices in dilution and risk-adjusted return",
    ],
    cons: [
      "Highly sensitive to exit-year assumptions",
      "Ignores intermediate rounds and dilution unless modelled explicitly",
    ],
    auContext:
      "AU seed target ROI typically 15–25x (vs. 10–20x US) reflecting a thinner Series B market — factor this in.",
  },
  {
    slug: "dcf",
    name: "Discounted Cash Flow (DCF)",
    bestFor: "Revenue with 24+ months of history, cash-generative",
    formula:
      "Valuation = Σ (FCFₜ ÷ (1 + WACC)ᵗ) + Terminal value ÷ (1 + WACC)ⁿ",
    formulaNote:
      "For AU seed / Series A: WACC 25–40% (vs. 8–12% for mature businesses). Terminal value uses Gordon growth (g = 2–3% AU long-run inflation).",
    howItWorks:
      "Project 5-year free cash flow, discount each year at the WACC, add discounted terminal value. Use a scenario band (bear/base/bull) for AU startups — single-point DCF is misleading below Series B.",
    pros: [
      "Most defensible for cash-generative companies",
      "Forces explicit assumption on growth, margin, and cost",
    ],
    cons: [
      "Assumption-heavy — small WACC change swings valuation dramatically",
      "Not credible for pre-revenue startups",
    ],
    auContext:
      "For AU SaaS: use WACC 28–35% until ARR > AUD $5M, then step down. BlockID's cfo-valuation runs a 3-scenario DCF band automatically.",
  },
];

export default function ValuationMethodsGuidePage() {
  return (
    <>
      <PageTracker page="guides/valuation-methods" />
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              Founder guide · AU-tuned
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              6 startup valuation methods — formulae &amp; when to use each
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              A working reference for Australian founders. Every method here is
              implemented inside BlockID&apos;s valuation engine — this guide
              shows you the maths, the trade-offs, and which one to lead with at
              your stage.
            </p>
          </header>

          <section className="mt-12 rounded-2xl border border-surface-200 bg-surface-50 p-6 md:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-700">
              Which method fits your stage?
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-600 border-b border-surface-200">
                    <th className="py-2 pr-4 font-medium">Stage</th>
                    <th className="py-2 pr-4 font-medium">Primary method</th>
                    <th className="py-2 font-medium">Triangulate with</th>
                  </tr>
                </thead>
                <tbody className="text-ink-800">
                  <tr className="border-b border-surface-200/60">
                    <td className="py-2 pr-4">Idea / pre-incorporation</td>
                    <td className="py-2 pr-4">Berkus</td>
                    <td className="py-2">Scorecard</td>
                  </tr>
                  <tr className="border-b border-surface-200/60">
                    <td className="py-2 pr-4">Pre-seed (MVP, no revenue)</td>
                    <td className="py-2 pr-4">Scorecard</td>
                    <td className="py-2">Berkus, Risk-Factor Summation</td>
                  </tr>
                  <tr className="border-b border-surface-200/60">
                    <td className="py-2 pr-4">Seed (AUD $10–50k MRR)</td>
                    <td className="py-2 pr-4">Comparables + VC Method</td>
                    <td className="py-2">Scorecard</td>
                  </tr>
                  <tr className="border-b border-surface-200/60">
                    <td className="py-2 pr-4">Series A (AUD $100k+ MRR)</td>
                    <td className="py-2 pr-4">Comparables + DCF</td>
                    <td className="py-2">VC Method</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Growth (cash-generative)</td>
                    <td className="py-2 pr-4">DCF</td>
                    <td className="py-2">Comparables</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-14 space-y-8">
            {METHODS.map((m) => (
              <article
                key={m.slug}
                id={m.slug}
                className="rounded-2xl border border-surface-200 bg-white p-6 md:p-8 shadow-sm"
              >
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-2xl font-semibold text-ink-800">
                    {m.name}
                  </h2>
                  <span className="text-xs uppercase tracking-wide text-gold-600 font-medium">
                    Best for: {m.bestFor}
                  </span>
                </header>

                <div className="mt-4 rounded-lg bg-surface-50 border border-surface-200 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    Formula
                  </p>
                  <p className="mt-1 font-mono text-sm text-ink-800">
                    {m.formula}
                  </p>
                  <p className="mt-2 text-xs text-ink-600 leading-relaxed">
                    {m.formulaNote}
                  </p>
                </div>

                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-ink-700">
                    How it works
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">
                    {m.howItWorks}
                  </p>
                </div>

                <div className="mt-5 grid md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-700">
                      Strengths
                    </h3>
                    <ul className="mt-1 space-y-1 text-sm text-ink-600 list-disc pl-5">
                      {m.pros.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink-700">
                      Limitations
                    </h3>
                    <ul className="mt-1 space-y-1 text-sm text-ink-600 list-disc pl-5">
                      {m.cons.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-5 rounded-lg border-l-2 border-gold-500 bg-gold-50/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">
                    AU context
                  </p>
                  <p className="mt-1 text-sm text-ink-700 leading-relaxed">
                    {m.auContext}
                  </p>
                </div>
              </article>
            ))}
          </section>

          <section className="mt-16 rounded-2xl border border-gold-200 bg-gradient-to-br from-gold-50 to-white p-6 md:p-8">
            <h2 className="text-2xl font-semibold text-ink-800">
              Run all six on your startup — free
            </h2>
            <p className="mt-2 text-sm md:text-base text-ink-600 max-w-2xl">
              BlockID&apos;s valuation engine runs Berkus, Scorecard, Risk-Factor
              Summation, Comparables, VC Method and DCF in parallel, then blends
              them with stage-appropriate weights. AUD-native, AU comparables,
              no credit card.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/tools/idea-valuation"
                className="inline-flex items-center rounded-lg bg-ink-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-700 transition"
              >
                Try the free calculator
              </Link>
              <Link
                href="/benchmarks"
                className="inline-flex items-center rounded-lg border border-surface-300 bg-white px-5 py-2.5 text-sm font-medium text-ink-800 hover:bg-surface-50 transition"
              >
                See AU benchmarks
              </Link>
            </div>
          </section>

          <p className="mt-10 text-xs text-ink-500 leading-relaxed">
            General information only, not financial advice under the
            Corporations Act 2001 (Cth). Valuations are estimates — always
            triangulate with recent comparable raises and take independent
            professional advice before negotiating.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
