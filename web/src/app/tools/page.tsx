import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";

const TITLE = "Free Startup Tools | BlockID — Valuation, Cap Table & More";
const DESCRIPTION =
  "16 free tools for Australian startup founders: idea clarifier, sector-aware idea lab, equity split calculator, dilution modeller, cap table, SAFE note calculator, ESIC checker, R&D tax calculator, and more. No login required.";
const CANONICAL = "https://blockid.au/tools";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "free startup tools australia",
    "startup idea clarifier",
    "startup idea generator",
    "sector startup angles",
    "equity split calculator",
    "dilution calculator australia",
    "cap table tool free",
    "SAFE note calculator australia",
    "ESIC eligibility checker",
    "R&D tax calculator australia",
    "startup valuation tool",
    "term sheet analyser",
    "co-founder matching tool",
    "ASIC compliance checker",
    "funding plan generator",
    "free tools for founders",
    "australian startup resources",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CANONICAL,
    siteName: "BlockID.au",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: CANONICAL,
  },
};

interface ToolDef {
  slug: string;
  name: string;
  desc: string;
  icon: string;
  tag?: string;
}

interface Category {
  id: string;
  label: string;
  desc: string;
  tools: ToolDef[];
}

const CATEGORIES: Category[] = [
  {
    id: "ideation",
    label: "Ideation & Validation",
    desc: "Sharpen your idea before you commit time and money",
    tools: [
      {
        slug: "idea-clarify",
        name: "First-Principles Idea Clarifier",
        desc: "Answer 5–7 Socratic questions and get routed to the right next step — SVI, cap table, ESIC eligibility, or fundraise prep.",
        icon: "🧭",
      },
      {
        slug: "idea-lab",
        name: "AI Idea Lab",
        desc: "Pick a sector, describe a broad problem, and generate 10 concrete startup angles plus 3 real Australian competitors.",
        icon: "🧪",
        tag: "AI Powered",
      },
    ],
  },
  {
    id: "valuation",
    label: "Valuation Tools",
    desc: "Understand and communicate your startup's worth",
    tools: [
      {
        slug: "idea-valuation",
        name: "Idea Valuation",
        desc: "Know whether your idea is worth pursuing — before you spend a dollar on it. 8-dimension investor-grade score in 60 seconds.",
        icon: "💡",
        tag: "Most Popular",
      },
      {
        slug: "dilution",
        name: "Dilution Modeller",
        desc: "See exactly how much of your company you keep after each funding round — before you sign anything.",
        icon: "📉",
      },
      {
        slug: "safe-calculator",
        name: "SAFE Note Calculator",
        desc: "Stop guessing what your SAFE converts to. See shares, dilution, and ownership at the next priced round — tuned for AU templates.",
        icon: "💰",
        tag: "AU Specific",
      },
      {
        slug: "esop-checklist",
        name: "ESOP Legal Checklist",
        desc: "Set up your employee option pool correctly the first time. 19 AU-specific checks so you don't get caught out by ESS Part 7A.",
        icon: "✅",
        tag: "AU Specific",
      },
      {
        slug: "funding-plan",
        name: "Funding Plan Generator",
        desc: "Walk into investor meetings with a credible raise plan — stage-matched milestones, target amounts, and investor strategy included.",
        icon: "🚀",
      },
    ],
  },
  {
    id: "financial",
    label: "Financial Tools",
    desc: "Model equity, ownership, and financial structure",
    tools: [
      {
        slug: "equity-split",
        name: "Equity Split Calculator",
        desc: "Know exactly who owns what before a disagreement starts. Fair co-founder splits using Slicing Pie and AU benchmarks.",
        icon: "⚖️",
      },
      {
        slug: "cap-table",
        name: "Cap Table Manager",
        desc: "Always know your ownership structure — shares, options, convertible notes, and ESOP pools in one place.",
        icon: "📊",
      },
      {
        slug: "cofounder-match",
        name: "Co-Founder Match",
        desc: "Stop recruiting the wrong co-founder. Find the profile that fills your real gaps — skills, domain, and experience.",
        icon: "🤝",
      },
      {
        slug: "data-room",
        name: "Data Room Builder",
        desc: "Never lose a deal because your data room wasn't ready. Build an investor-grade checklist with completion tracking.",
        icon: "📁",
      },
      {
        slug: "financial-projections",
        name: "Financial Projection Norms",
        desc: "Find out if your numbers are credible before an investor does. Instant percentile against AU pre-seed, seed, and Series A benchmarks.",
        icon: "📈",
        tag: "AU Specific",
      },
    ],
  },
  {
    id: "legal",
    label: "Legal & Compliance Tools",
    desc: "Stay compliant and maximise Australian tax benefits",
    tools: [
      {
        slug: "esic",
        name: "ESIC Eligibility Checker",
        desc: "Unlock up to 20% tax offset and CGT exemption for investors — find out in minutes if your startup qualifies under Division 360.",
        icon: "🇦🇺",
        tag: "AU Specific",
      },
      {
        slug: "rnd-tax",
        name: "R&D Tax Calculator",
        desc: "See how much cash you can claw back from the ATO. Instant estimate of your 43.5% R&D refundable offset under Division 355.",
        icon: "🧪",
        tag: "AU Specific",
      },
      {
        slug: "asic",
        name: "ASIC Compliance Checker",
        desc: "Avoid fines and deregistration. Verify every ASIC obligation under the Corporations Act 2001 — ABN, annual reviews, directors, and records.",
        icon: "⚖️",
        tag: "AU Specific",
      },
      {
        slug: "term-sheet",
        name: "Term Sheet AI",
        desc: "Don't sign until you understand every clause. AI flags red flags, unusual terms, and your real negotiation leverage.",
        icon: "📝",
        tag: "AI Powered",
      },
    ],
  },
];

const ALL_TOOLS = CATEGORIES.flatMap((c) => c.tools);

const TAG_COLOURS: Record<string, string> = {
  "Most Popular": "bg-brand-100 text-brand-700",
  "AI Powered": "bg-violet-100 text-violet-700",
  "AU Specific": "bg-gold-100 text-gold-700",
};

function ToolCard({ tool }: { tool: ToolDef }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group relative flex flex-col rounded-2xl border border-surface-200 bg-white p-6 transition-all hover:shadow-md hover:border-brand-300 hover:-translate-y-0.5"
    >
      {tool.tag ? (
        <span
          className={`absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${TAG_COLOURS[tool.tag] ?? "bg-surface-100 text-ink-500"}`}
        >
          {tool.tag}
        </span>
      ) : null}
      <span className="text-3xl" aria-hidden="true">
        {tool.icon}
      </span>
      <h3 className="mt-3 text-base font-semibold text-ink-800 group-hover:text-brand-600 transition-colors">
        {tool.name}
      </h3>
      <p className="mt-2 flex-1 text-sm text-ink-500 leading-relaxed">
        {tool.desc}
      </p>
      <span className="mt-4 inline-flex items-center text-xs font-medium text-brand-600 group-hover:gap-1.5 transition-all">
        Use Free Tool →
      </span>
    </Link>
  );
}

export default function ToolsPage() {
  const totalTools = ALL_TOOLS.length;
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 min-h-screen bg-surface-50">
        {/* ── Hero ── */}
        <section className="bg-ink-950 text-white pt-32 pb-16">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-brand-400 font-medium mb-3">
              Free Tools for Founders
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Every hard problem a founder faces.{" "}
              <span className="text-brand-400">Solved free.</span>
            </h1>
            <p className="mt-5 text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              {totalTools} AU-native tools covering ideation, valuation, equity,
              compliance, fundraising, and tax. No login. No paywall. Just
              answers.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-slate-500">
              {["No credit card", "No login required", "AU-specific data", "Updated for 2026"].map(
                (badge) => (
                  <span
                    key={badge}
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs"
                  >
                    ✓ {badge}
                  </span>
                )
              )}
            </div>
          </div>
        </section>

        {/* ── Quick-jump anchor nav ── */}
        <nav
          aria-label="Tool categories"
          className="sticky top-0 z-10 border-b border-surface-200 bg-white/80 backdrop-blur"
        >
          <div className="mx-auto max-w-6xl px-6 flex items-center gap-6 h-12 overflow-x-auto text-sm font-medium text-ink-500 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <a
                key={cat.id}
                href={`#${cat.id}`}
                className="whitespace-nowrap hover:text-brand-600 transition-colors"
              >
                {cat.label}
              </a>
            ))}
          </div>
        </nav>

        {/* ── Categories ── */}
        <div className="mx-auto max-w-6xl px-6 py-14 space-y-16">
          {CATEGORIES.map((cat) => (
            <section key={cat.id} id={cat.id} aria-labelledby={`cat-${cat.id}`}>
              <div className="mb-6">
                <h2
                  id={`cat-${cat.id}`}
                  className="text-xl font-semibold text-ink-800"
                >
                  {cat.label}
                </h2>
                <p className="mt-1 text-sm text-ink-400">{cat.desc}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {cat.tools.map((tool) => (
                  <ToolCard key={tool.slug} tool={tool} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* ── CTA ── */}
        <section className="bg-ink-950 text-white">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-brand-400 font-medium mb-3">
              Full Platform
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Want a single score that ties it all together?
            </h2>
            <p className="mt-4 text-slate-400 leading-relaxed max-w-xl mx-auto">
              The BlockID Startup Value Index combines all dimensions — traction,
              team, IP, compliance, and more — into one investor-ready score.
              Free for early-stage founders.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/score"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-8 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Get Your Free SVI Score →
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-8 py-3 text-sm font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
