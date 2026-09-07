// /tbr/demo — public "reference" Trusted Business Report preview.
//
// Wave 25A shipped /tbr/[token] as the authenticated share URL for a
// founder's persisted SVI snapshot, but there was no anonymous URL an
// investor could open to see what a TBR actually contains before asking
// a founder to mint a token. This page fills that gap with a fully
// static preview: sample 8-dimension SVI scores, the investor summary,
// and links to the interactive showcase and sample gallery.
//
// Server component. No DB reads, no auth, safe to CDN-cache.

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";

export const dynamic = "force-static";

const TITLE = "Sample Trusted Business Report — BlockID SVI preview";
const DESCRIPTION =
  "See what a BlockID Trusted Business Report looks like before requesting one from a founder: 8 SVI dimensions, 13 investor criteria, valuation range and next-action roadmap. Anonymous preview, no login required.";
const CANONICAL = "https://blockid.au/tbr/demo";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CANONICAL,
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: { canonical: CANONICAL },
  robots: { index: true, follow: true },
};

// Illustrative SVI grades — clearly labelled as a demo throughout the page.
const DEMO_DIMENSIONS: ReadonlyArray<{
  key: string;
  label: string;
  score: number;
  headline: string;
}> = [
  { key: "ftv", label: "Founder–Team Value", score: 82, headline: "Repeat founder, sector-domain team." },
  { key: "mpc", label: "Market Position & Category", score: 74, headline: "AU SME SaaS category, top-3 share." },
  { key: "ptd", label: "Product & Tech Depth", score: 78, headline: "Multi-tenant platform, 2 patents pending." },
  { key: "tre", label: "Traction & Revenue Engine", score: 71, headline: "A$1.2M ARR, 4.5% MoM growth." },
  { key: "cgh", label: "Capital & Governance Health", score: 68, headline: "Clean cap table, one prior seed round." },
  { key: "iri", label: "IP, Regulatory & Integrity", score: 76, headline: "Essential Eight ML1, SOC2-lite in progress." },
  { key: "lco", label: "Locale, Compliance & ESIC", score: 81, headline: "ESIC-eligible, R&D Tax Incentive claimed." },
  { key: "svm", label: "Sustained Value & Moat", score: 65, headline: "Category moat forming, switching cost mid." },
];

const CRITERIA_HIGHLIGHTS: ReadonlyArray<{ label: string; verdict: string }> = [
  { label: "Founder-market fit", verdict: "Strong — 8yr domain, prior exit." },
  { label: "Unit economics", verdict: "Positive — LTV/CAC 3.4×, payback 11 months." },
  { label: "Regulatory posture", verdict: "Clear — no AFSL required, GST registered, Privacy Act compliant." },
  { label: "Runway", verdict: "13 months at current burn (A$118k/mo)." },
];

export default function TbrDemoPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Demo · Not a real startup"
        title="What a Trusted Business Report looks like"
        subtitle="A fully-populated sample TBR so investors can see the depth of evidence before asking a founder to mint one. Every number below is illustrative — no real company data is disclosed on this page."
        primaryCta={{ href: "/showcase/atlassian?step=1", label: "Open interactive showcase" }}
        secondaryCta={{ href: "/guide/reports", label: "Browse sample gallery" }}
      />

      <MarketingSection kicker="Section 1" title="8 SVI dimensions with completeness">
        <p className="max-w-3xl text-sm text-[var(--fintech-ink-muted)]">
          Every real TBR carries a score, priority and a one-line rationale for
          each of the eight Startup Value Index dimensions. The founder can
          drill into any card for the underlying evidence, benchmarks and
          suggested next actions.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DEMO_DIMENSIONS.map((d) => (
            <div
              key={d.key}
              className="rounded-2xl border border-surface-200 bg-white p-4"
            >
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-500">
                {d.key.toUpperCase()}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink-800">
                {d.label}
              </p>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="font-mono text-2xl tabular-nums text-ink-800">
                  {d.score}
                </span>
                <span className="text-[10px] text-ink-500">/ 100</span>
              </div>
              <p className="mt-3 text-xs text-ink-500">{d.headline}</p>
            </div>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection kicker="Section 2" title="13 investor criteria — verdicts at a glance">
        <ul className="grid gap-3 sm:grid-cols-2">
          {CRITERIA_HIGHLIGHTS.map((c) => (
            <li
              key={c.label}
              className="rounded-xl border border-surface-200 bg-white p-4"
            >
              <p className="text-sm font-semibold text-ink-800">{c.label}</p>
              <p className="mt-1 text-xs text-ink-500">{c.verdict}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-500">
          The interactive report ships all 8 SVI dimensions with strengths, gaps and
          a concrete next action per row. Preview them in the {" "}
          <Link className="text-brand-600 underline" href="/showcase/atlassian?step=1">
            Atlassian showcase
          </Link>
          .
        </p>
      </MarketingSection>

      <MarketingSection kicker="Section 3" title="Valuation band and improvement roadmap">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-500">
              Illustrative valuation range
            </p>
            <p className="mt-2 font-mono text-2xl text-ink-800 tabular-nums">
              A$8.2M – A$12.6M
            </p>
            <p className="mt-2 text-xs text-ink-500">
              Comparable AU seed SaaS, 8–10× ARR blended with DCF and Berkus.
              Real reports show the working, comps used and sensitivity table.
            </p>
          </div>
          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-500">
              Top 3 next actions
            </p>
            <ol className="mt-2 space-y-2 text-sm text-ink-700 list-decimal list-inside">
              <li>Formalise SOC2-lite evidence pack (+6 IRI points).</li>
              <li>Lock two anchor logos into 12-month contracts (+8 TRE).</li>
              <li>Publish moat/switching-cost analysis for Series A deck (+5 SVM).</li>
            </ol>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection kicker="Ready for a real one?" title="Ask a founder to mint their TBR">
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/showcase/atlassian?step=1"
            className="group block rounded-2xl border border-surface-200 bg-white p-5 transition-colors hover:border-brand-500/50"
          >
            <p className="text-sm font-semibold text-ink-800">
              Interactive showcase
            </p>
            <p className="mt-1 text-xs text-ink-500">
              Walk through a fully-populated demo report step by step.
            </p>
          </Link>
          <Link
            href="/guide/reports"
            className="group block rounded-2xl border border-surface-200 bg-white p-5 transition-colors hover:border-brand-500/50"
          >
            <p className="text-sm font-semibold text-ink-800">
              Sample report gallery
            </p>
            <p className="mt-1 text-xs text-ink-500">
              Compare TBR variants across sectors and stages.
            </p>
          </Link>
          <Link
            href="/investor"
            className="group block rounded-2xl border border-surface-200 bg-white p-5 transition-colors hover:border-brand-500/50"
          >
            <p className="text-sm font-semibold text-ink-800">
              Investor home
            </p>
            <p className="mt-1 text-xs text-ink-500">
              Browse startups with a real SVI grade and request the pack.
            </p>
          </Link>
        </div>
      </MarketingSection>

      <MarketingSection>
        <NotFinancialAdvice kind="not_financial_advice" />
      </MarketingSection>
    </MarketingShell>
  );
}
