/**
 * /guide/scn — Startup Compass primer + framework citations.
 *
 * Externally-facing citation page: explains that SCN ("Startup Compass") is a
 * synthesis overlay on published, widely-used startup frameworks, not
 * BlockID-proprietary theory. Advisors landing here from a dashboard footer
 * link should be able to verify every dimension against its primary source.
 *
 * Real-world workflow parity audit #9 — see
 * docs/plans/real-world-workflow-parity-audit-2026-07-23.md §6 item 9.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";

const SITE_URL = "https://blockid.au";
const CANONICAL = `${SITE_URL}/guide/scn`;

const TITLE = "Startup Compass — Framework citations & primer | BlockID";
const DESCRIPTION =
  "Startup Compass (SCN) is BlockID's 5-dimension synthesis overlay on Sean Ellis 40% Rule, Porter Five Forces, T2D3 growth, Christensen JTBD, and Bessemer BVP canonical stages. See every citation.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "startup compass",
    "sean ellis 40 percent rule",
    "porter five forces",
    "t2d3 growth",
    "jobs to be done",
    "bessemer bvp canonical stages",
    "startup framework synthesis",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "article",
    url: CANONICAL,
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  alternates: { canonical: CANONICAL },
  robots: { index: true, follow: true },
};

interface Dimension {
  code: "V" | "P" | "VAL" | "D" | "C";
  name: string;
  question: string;
  frameworks: {
    label: string;
    author: string;
    year?: string;
    summary: string;
    /** Optional external URL. Marked "citation-needed" when we cannot verify. */
    url?: string;
    citationNeeded?: boolean;
  }[];
  guideChapters: { slug: string; title: string }[];
}

const DIMENSIONS: Dimension[] = [
  {
    code: "V",
    name: "Validation",
    question: "Do the target customers have the problem, and will they pay?",
    frameworks: [
      {
        label: "40% Rule (PMF survey)",
        author: "Sean Ellis",
        year: "2009",
        summary:
          "If ≥40% of users say they would be 'very disappointed' without the product, you have signal for product-market fit.",
        url: "https://www.startup-marketing.com/the-startup-pyramid/",
      },
      {
        label: "Superhuman PMF Engine",
        author: "Rahul Vohra",
        year: "2018",
        summary:
          "Operationalises the 40% Rule into a repeatable engine — segment the 'very disappointed' users and double down on their why.",
        url: "https://review.firstround.com/how-superhuman-built-an-engine-to-find-product-market-fit/",
      },
    ],
    guideChapters: [
      { slug: "02-idea-validation", title: "Chapter 2 · Idea validation" },
      { slug: "05-pmf", title: "Chapter 5 · Product-market fit" },
    ],
  },
  {
    code: "P",
    name: "Position",
    question: "Where do you sit in the market vs incumbents and substitutes?",
    frameworks: [
      {
        label: "Five Forces",
        author: "Michael E. Porter (Harvard Business School)",
        year: "1979",
        summary:
          "Rivalry, new entrants, substitutes, supplier power, buyer power — the canonical structural-attractiveness lens.",
        url: "https://hbr.org/1979/03/how-competitive-forces-shape-strategy",
      },
      {
        label: "Blue Ocean Strategy",
        author: "W. Chan Kim & Renée Mauborgne (INSEAD)",
        year: "2005",
        summary:
          "Value-innovation lens: create uncontested market space rather than compete in the red ocean.",
        url: "https://www.blueoceanstrategy.com/what-is-blue-ocean-strategy/",
      },
    ],
    guideChapters: [
      { slug: "03-market-research", title: "Chapter 3 · Market research" },
    ],
  },
  {
    code: "VAL",
    name: "Value",
    question: "Is the growth trajectory venture-scale, and are the SaaS unit economics healthy?",
    frameworks: [
      {
        label: "T2D3",
        author: "Neeraj Agrawal (Battery Ventures)",
        year: "2015",
        summary:
          "Triple, Triple, Double, Double, Double — the ARR trajectory a SaaS company should hit to reach ~$100M ARR and IPO-scale.",
        url: "https://techcrunch.com/2015/02/01/the-saas-travel-adventure/",
      },
      {
        label: "State of the Cloud / BVP SaaS benchmarks",
        author: "Bessemer Venture Partners",
        summary:
          "The reference set of SaaS benchmarks used by growth-stage investors — CAC payback, net dollar retention, magic number, Rule of 40.",
        url: "https://www.bvp.com/atlas/state-of-the-cloud-2023",
      },
    ],
    guideChapters: [
      { slug: "06-revenue", title: "Chapter 6 · Revenue" },
      { slug: "07-growth", title: "Chapter 7 · Growth" },
    ],
  },
  {
    code: "D",
    name: "Direction",
    question: "What's the single most important move next, and why?",
    frameworks: [
      {
        label: "Jobs-to-be-Done (JTBD)",
        author: "Clayton Christensen (Harvard Business School)",
        summary:
          "Customers 'hire' products to get a job done. Sequencing the roadmap by underserved jobs beats sequencing by feature demand.",
        url: "https://hbr.org/2016/09/know-your-customers-jobs-to-be-done",
      },
      {
        label: "Working backwards (PR/FAQ)",
        author: "Amazon",
        summary:
          "Write the launch press release + FAQ before you build. Forces clarity on the customer benefit before scoping the work.",
        url: "https://www.workingbackwards.com/",
      },
    ],
    guideChapters: [
      { slug: "02-idea-validation", title: "Chapter 2 · Idea validation" },
      { slug: "04-mvp", title: "Chapter 4 · MVP" },
    ],
  },
  {
    code: "C",
    name: "Capital",
    question: "Are you ready to raise the next round, and at what stage?",
    frameworks: [
      {
        label: "Seed hurdle-rate guidance",
        author: "Y Combinator",
        summary:
          "YC's public guidance on what a company must show to raise seed / Series A — traction, team, market, and clarity of ask.",
        url: "https://www.ycombinator.com/library",
        citationNeeded: true,
      },
      {
        label: "BVP canonical stage definitions",
        author: "Bessemer Venture Partners",
        summary:
          "Pre-seed → Seed → Series A → Series B → Growth stage gates, tied to ARR bands and go-to-market maturity.",
        url: "https://www.bvp.com/atlas",
      },
    ],
    guideChapters: [
      { slug: "09-funding", title: "Chapter 9 · Funding" },
      { slug: "10-fundraise", title: "Chapter 10 · Fundraise" },
    ],
  },
];

export default function StartupCompassPrimerPage() {
  return (
    <>
      <PageTracker page="guide-scn" />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <header className="mb-10">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-600">
            Startup Compass · Framework citations
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl dark:text-slate-100">
            What Startup Compass actually is (and isn&apos;t)
          </h1>
          <p className="mt-4 text-lg text-slate-700 dark:text-slate-300">
            Startup Compass — the internal code symbol is <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-mono dark:bg-slate-800">SCN</code> — is
            BlockID&apos;s 5-dimension diagnostic overlay. It is <strong>not proprietary
            theory</strong>. It is a bundling of five widely-used, externally-published
            startup frameworks into a single actionable lens, so founders don&apos;t
            have to juggle 8-12 disparate models at once.
          </p>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            If you&apos;re an advisor or investor evaluating BlockID&apos;s
            recommendations, every dimension below traces back to its primary
            source. Where we cannot verify a canonical published citation, we
            mark it <em>citation-needed</em> rather than fabricate one.
          </p>
        </header>

        <section className="mb-10 rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            The five dimensions
          </h2>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            <strong>V</strong>alidation → <strong>P</strong>osition → <strong>V</strong>alue → <strong>D</strong>irection → <strong>C</strong>apital.
            Each maps to one or more chapters of the{" "}
            <Link href="/guide/01-vision" className="text-emerald-700 underline decoration-dotted dark:text-emerald-400">
              12-chapter Startup Journey guide
            </Link>
            .
          </p>
        </section>

        {DIMENSIONS.map((d) => (
          <section
            key={d.code}
            className="mb-10 border-t border-slate-200 pt-8 dark:border-slate-800"
          >
            <div className="flex items-baseline gap-3">
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                {d.code}
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {d.name}
              </h2>
            </div>
            <p className="mt-2 text-sm italic text-slate-600 dark:text-slate-400">
              &ldquo;{d.question}&rdquo;
            </p>

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Underlying frameworks
            </h3>
            <ul className="mt-3 space-y-4">
              {d.frameworks.map((f) => (
                <li key={f.label} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {f.label}
                    {f.citationNeeded && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        citation-needed
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {f.author}
                    {f.year ? ` · ${f.year}` : null}
                  </p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{f.summary}</p>
                  {f.url && (
                    <p className="mt-2 text-xs">
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-emerald-700 underline decoration-dotted hover:text-emerald-600 dark:text-emerald-400"
                      >
                        Primary source ↗
                      </a>
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Related chapters
            </h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {d.guideChapters.map((ch) => (
                <li key={ch.slug}>
                  <Link
                    href={`/guide/${ch.slug}`}
                    className="rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                  >
                    {ch.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="mt-12 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Why we bundle
          </h2>
          <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
            A pre-seed founder faced with Sean Ellis, Porter, T2D3, JTBD, and BVP
            in parallel has to context-switch between five theoretical languages.
            Startup Compass compresses those languages into one 5-word question
            set — <em>Where are you? Where do you sit? What are you worth? What&apos;s
            next? Are you ready to raise?</em> — and preserves the ability to
            drill down into the primary source when precision is required.
          </p>
          <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
            Advisors and investors: if a Startup Compass recommendation surprises
            you, follow the citation. Founders: if a dimension feels shallow,
            open the linked framework and go deeper.
          </p>
        </section>

        <nav className="mt-12 grid gap-4 border-t border-slate-200 pt-8 md:grid-cols-2 dark:border-slate-800">
          <Link
            href="/guide/01-vision"
            className="rounded-lg border border-slate-200 p-4 text-left transition hover:border-emerald-400 dark:border-slate-800"
          >
            <span className="text-xs uppercase tracking-wide text-slate-400">
              Start the journey
            </span>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Chapter 1 · Vision
            </p>
          </Link>
          <Link
            href="/guide/reports"
            className="rounded-lg border border-slate-200 p-4 text-right transition hover:border-emerald-400 dark:border-slate-800"
          >
            <span className="text-xs uppercase tracking-wide text-slate-400">
              See reports built on Startup Compass
            </span>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Report template library
            </p>
          </Link>
        </nav>
      </main>
      <Footer />
    </>
  );
}
