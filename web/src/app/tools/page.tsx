import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Free Startup Tools — 10 Tools for Founders | BlockID.au",
  description: "Access 10 free tools for Australian startup founders: equity split calculator, dilution modeller, cap table, term sheet AI, data room builder, ESIC checker, and more.",
};

interface ToolDef {
  slug: string;
  name: string;
  desc: string;
  icon: string;
  tag?: string;
}

const TOOLS: ToolDef[] = [
  {
    slug: "idea-valuation",
    name: "Idea Valuation",
    desc: "Get an instant AI-powered valuation score for your startup idea. 8-dimension analysis in 60 seconds.",
    icon: "\u{1F4A1}",
    tag: "Most Popular",
  },
  {
    slug: "equity-split",
    name: "Equity Split Calculator",
    desc: "Calculate fair equity splits between co-founders using Slicing Pie methodology and AU benchmarks.",
    icon: "\u2696\uFE0F",
  },
  {
    slug: "dilution",
    name: "Dilution Modeller",
    desc: "Model how fundraising rounds affect your ownership. Visualise dilution across multiple rounds.",
    icon: "\u{1F4C9}",
  },
  {
    slug: "cap-table",
    name: "Cap Table Manager",
    desc: "Build and manage your cap table with shares, options, convertible notes, and ESOP pools.",
    icon: "\u{1F4CA}",
  },
  {
    slug: "term-sheet",
    name: "Term Sheet AI",
    desc: "Upload a term sheet and get AI-powered analysis of key terms, red flags, and negotiation points.",
    icon: "\u{1F4DD}",
    tag: "AI Powered",
  },
  {
    slug: "data-room",
    name: "Data Room Builder",
    desc: "Create an investor-ready data room checklist with document tracking and completion scores.",
    icon: "\u{1F4C1}",
  },
  {
    slug: "cofounder-match",
    name: "Co-Founder Match",
    desc: "Find your ideal co-founder profile based on complementary skills, experience, and domain expertise.",
    icon: "\u{1F91D}",
  },
  {
    slug: "esic",
    name: "ESIC Eligibility Checker",
    desc: "Check if your startup qualifies for the Early Stage Innovation Company tax concessions (Division 360).",
    icon: "\u{1F1E6}\u{1F1FA}",
    tag: "AU Specific",
  },
  {
    slug: "rnd-tax",
    name: "R&D Tax Calculator",
    desc: "Estimate your R&D Tax Incentive offset under Division 355. 43.5% refundable for companies under $20M turnover.",
    icon: "\u{1F9EA}",
    tag: "AU Specific",
  },
  {
    slug: "funding-plan",
    name: "Funding Plan Generator",
    desc: "Generate a stage-appropriate fundraise plan with milestones, target raise amounts, and investor strategy.",
    icon: "\u{1F680}",
  },
];

export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-ink-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-brand-400 font-medium mb-3">Free Tools for Founders</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            10 Free Startup Tools
          </h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Everything you need from idea validation to fundraise preparation. No credit card required. Built for Australian founders.
          </p>
        </div>
      </div>

      {/* Tools Grid */}
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {TOOLS.map((tool) => (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              className="group relative rounded-2xl border border-surface-200 bg-white p-6 transition-all hover:shadow-lg hover:border-brand-300 hover:-translate-y-0.5"
            >
              {"tag" in tool && tool.tag ? (
                <span className="absolute top-4 right-4 text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-100 px-2 py-0.5 rounded-full" style={{ fontSize: 10 }}>
                  {String(tool.tag)}
                </span>
              ) : null}
              <span className="text-3xl">{tool.icon}</span>
              <h2 className="mt-3 text-lg font-semibold text-ink-800 group-hover:text-brand-600 transition-colors">
                {tool.name}
              </h2>
              <p className="mt-2 text-sm text-ink-500 leading-relaxed">
                {tool.desc}
              </p>
              <span className="mt-4 inline-flex items-center text-xs font-medium text-brand-600 group-hover:text-brand-700">
                Try free →
              </span>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-ink-500 text-sm mb-4">
            Want deeper analysis? Get your full Startup Value Index report.
          </p>
          <Link
            href="/score"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-8 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Get Your Free SVI Score →
          </Link>
        </div>
      </div>
    </main>
  );
}
