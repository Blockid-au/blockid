// /showcase — Menu of case-study demos. Each entry is a real public
// company's journey through the 12-phase BlockID.au startup roadmap.
//
// Track C. Adds discoverability + progressive expansion (Atlassian first;
// Canva, Xero, SafetyCulture, WiseTech, SEEK, Culture Amp queued for
// future ticks).

import Link from "next/link";

export const dynamic = "force-dynamic";

interface CaseStudy {
  slug: string;
  name: string;
  country: string;
  founded: number;
  ipo_year: number | "private";
  market_cap_usd: string;
  status: "live" | "coming_soon";
  tagline: string;
  themes: string[];
}

const CASES: CaseStudy[] = [
  {
    slug: "atlassian",
    name: "Atlassian",
    country: "🇦🇺 Australia",
    founded: 2002,
    ipo_year: 2015,
    market_cap_usd: "~US$21.7B",
    status: "live",
    tagline:
      "Bootstrapped Jira + Confluence in Sydney, took a single Accel secondary, listed on NASDAQ with dual-class control intact.",
    themes: ["bootstrap", "secondary-only", "dual-class", "product-led-growth", "NASDAQ IPO"],
  },
  {
    slug: "canva",
    name: "Canva",
    country: "🇦🇺 Australia",
    founded: 2012,
    ipo_year: "private",
    market_cap_usd: "~US$40B peak",
    status: "live",
    tagline:
      "Sydney design tool from Melanie Perkins — decacorn without IPO, 9 private rounds, Fusion-Yearbooks-precursor validation.",
    themes: ["Melanie Perkins", "decacorn-without-IPO", "growth-capital", "product-led"],
  },
  {
    slug: "xero",
    name: "Xero",
    country: "🇳🇿🇦🇺 NZ/AU",
    founded: 2006,
    ipo_year: 2007,
    market_cap_usd: "~US$18B",
    status: "coming_soon",
    tagline:
      "SaaS accounting from Wellington, listed on NZX 6 months after founding, later dual-listed on ASX.",
    themes: ["dual-listing", "NZX+ASX", "early-IPO", "SaaS-accounting"],
  },
  {
    slug: "safetyculture",
    name: "SafetyCulture",
    country: "🇦🇺 Australia",
    founded: 2004,
    ipo_year: "private",
    market_cap_usd: "~US$2B",
    status: "coming_soon",
    tagline:
      "Townsville-founded workplace-safety unicorn. Softbank-funded, private, values-driven culture.",
    themes: ["regional-Aussie-founder", "Softbank", "private-unicorn", "hardware-adjacent"],
  },
  {
    slug: "wisetech",
    name: "WiseTech Global",
    country: "🇦🇺 Australia",
    founded: 1994,
    ipo_year: 2016,
    market_cap_usd: "~US$25B",
    status: "coming_soon",
    tagline:
      "Logistics-software from Sydney, bootstrapped 22 years then ASX IPO. Aggressive M&A roll-up.",
    themes: ["long-bootstrap", "ASX-IPO", "M&A-roll-up", "logistics-vertical"],
  },
  {
    slug: "seek",
    name: "SEEK",
    country: "🇦🇺 Australia",
    founded: 1997,
    ipo_year: 2005,
    market_cap_usd: "~US$5B",
    status: "coming_soon",
    tagline:
      "Job-board turned global HR platform. Bassat brothers, ASX 2005, international expansion via M&A.",
    themes: ["marketplace", "ASX-IPO", "international-expansion", "brothers-cofounders"],
  },
];

export default function ShowcaseMenuPage() {
  const live = CASES.filter((c) => c.status === "live");
  const soon = CASES.filter((c) => c.status === "coming_soon");

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold text-ink-900">Showcase library</h1>
          <p className="mt-2 max-w-3xl text-base text-ink-600">
            Real public-company journeys walked through BlockID.au's 12-phase
            startup roadmap. Every fact is cited from public filings (SEC EDGAR,
            press releases, DEF 14A proxies) so a founder can compare their
            own trajectory against an audited baseline.
          </p>
          <p className="mt-2 text-sm text-ink-500">
            The library expands autonomously — new cases arrive as the goal
            loop researches, verifies, and publishes them.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-ink-900">
            Available now ({live.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {live.map((c) => (
              <CaseCard key={c.slug} c={c} live />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-ink-900">
            Coming soon ({soon.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {soon.map((c) => (
              <CaseCard key={c.slug} c={c} live={false} />
            ))}
          </div>
        </section>

        <footer className="mt-12 rounded-lg border border-surface-200 bg-white p-4 text-xs text-ink-500">
          Suggest a case study? Email{" "}
          <a href="mailto:admin@blockid.au" className="text-brand-700 underline">
            admin@blockid.au
          </a>{" "}
          — must be publicly listed OR have unusually detailed public
          documentation.
        </footer>
      </div>
    </div>
  );
}

function CaseCard({ c, live }: { c: CaseStudy; live: boolean }) {
  const inner = (
    <div
      className={`rounded-lg border p-5 transition-shadow ${
        live
          ? "border-surface-200 bg-white hover:shadow-md"
          : "border-dashed border-surface-300 bg-surface-100"
      }`}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-lg font-semibold text-ink-900">{c.name}</h3>
        <span className="text-xs text-ink-500">{c.country}</span>
      </div>
      <p className="text-sm text-ink-600">{c.tagline}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-ink-500">Founded</dt>
          <dd className="font-medium text-ink-900">{c.founded}</dd>
        </div>
        <div>
          <dt className="text-ink-500">IPO</dt>
          <dd className="font-medium text-ink-900">
            {c.ipo_year === "private" ? "still private" : c.ipo_year}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Market cap</dt>
          <dd className="font-medium text-ink-900">{c.market_cap_usd}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1">
        {c.themes.map((t) => (
          <span
            key={t}
            className="rounded bg-surface-100 px-1.5 py-0.5 text-[10px] text-ink-700"
          >
            {t}
          </span>
        ))}
      </div>
      {!live && (
        <p className="mt-3 text-xs italic text-ink-500">
          Queued for autonomous research + publication.
        </p>
      )}
    </div>
  );
  return live ? (
    <Link href={`/showcase/${c.slug}`} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
