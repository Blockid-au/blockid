import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  DollarSign,
  Eye,
  FolderOpen,
  Layers,
  Rocket,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "For investors — the BlockID opportunity",
  description:
    "Why BlockID: 600K AU companies, evidence-backed SVI engine, SaaS + credit hybrid model, 88-99.9% gross margins. Explore the investment opportunity.",
  alternates: {
    canonical: "https://blockid.au/investors",
  },
};

const SVI_DIMENSIONS = [
  "Team & Founders",
  "Market Opportunity",
  "Product & Technology",
  "Traction & Revenue",
  "Financials & Unit Economics",
  "Legal & Compliance",
  "Intellectual Property",
  "Investor Readiness",
];

const INVESTOR_FEATURES = [
  {
    icon: ShieldCheck,
    title: "Streamlined Due Diligence",
    body: "Access verified cap tables, financial models, and compliance documents through structured data rooms. Spend less time chasing paperwork.",
  },
  {
    icon: Eye,
    title: "Portfolio Visibility",
    body: "Get a live view of your portfolio companies' ownership structures, dilution scenarios, and SVI scores — all in one dashboard.",
  },
  {
    icon: FolderOpen,
    title: "Secure Data Rooms",
    body: "Founders share investor-ready data room links with granular access controls, watermarking, and audit trails.",
  },
  {
    icon: BarChart3,
    title: "Compliance Tracking",
    body: "Monitor ASIC filings, shareholder agreements, and regulatory milestones across your portfolio without manual follow-ups.",
  },
];

// 2026-09-10 (T0274): re-synced to the live ladder. The previous list —
// Per-Analysis A$0.50, Founding 100 A$5, Growth A$99, Enterprise A$499 —
// described SKUs that were retired or re-priced months ago. Founder ladder
// per G11/G12: Free → A$3 Trust BizReport → Starter A$29 → Growth A$69.
// Evaluator ladder per G12 D2: Scout A$79 · Firm A$149 · Program A$349.
const REVENUE_TIERS = [
  {
    tier: "Free",
    price: "A$0",
    detail: "First SVI analysis free, no signup",
  },
  {
    tier: "Trust BizReport",
    price: "A$3",
    detail: "Full 8-dimension, 13-criteria report on any startup — founders and evaluators alike",
  },
  {
    tier: "Founder Starter",
    price: "A$29/mo",
    detail: "Workspace that keeps the score, data room, investor links, Founder Radar",
  },
  {
    tier: "Founder Growth",
    price: "A$69/mo",
    detail: "Cap table, term sheets, evidence vault, weekly SVI snapshots",
  },
  {
    tier: "Evaluator — Scout / Firm / Program",
    price: "A$79 · A$149 · A$349/mo",
    detail: "Investors, advisory firms, accelerators: reports included, tracked startups, seats, white-label — 7-day free trial, card required",
  },
  {
    tier: "Contact Sales",
    price: "Custom",
    detail: "Multi-cohort accelerators, VC enterprise, reseller / wholesale",
  },
];

export default function InvestorsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-4xl px-6">
          {/* Hero */}
          <div className="text-center mb-16">
            <p className="text-sm uppercase tracking-[0.15em] text-brand-600 font-medium mb-3">
              Investment Opportunity
            </p>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-ink-900 leading-tight">
              The ownership intelligence platform for{" "}
              <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
                600,000 Australian companies
              </span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-600 max-w-2xl mx-auto">
              BlockID gives investors clarity and confidence to back great
              Australian startups — from first look to portfolio management,
              with verified data at your fingertips.
            </p>
          </div>

          {/* Why BlockID — The Market */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">
              Why BlockID
            </h2>
            <div className="rounded-2xl border border-surface-200 bg-surface-50 p-6">
              <div className="grid sm:grid-cols-3 gap-6 mb-6">
                <div className="text-center">
                  <p className="text-3xl font-extrabold font-mono tabular-nums text-brand-600">
                    600K
                  </p>
                  <p className="text-xs text-ink-500 mt-1">
                    Australian companies in TAM
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-extrabold font-mono tabular-nums text-brand-600">
                    70%
                  </p>
                  <p className="text-xs text-ink-500 mt-1">
                    Have cap table issues at Series A
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-extrabold font-mono tabular-nums text-brand-600">
                    $0
                  </p>
                  <p className="text-xs text-ink-500 mt-1">
                    AU-native alternatives today
                  </p>
                </div>
              </div>
              <p className="text-sm text-ink-600 leading-relaxed">
                Most Australian startups reach their first funding round with
                cap tables in spreadsheets, no formal valuation history, and
                incomplete compliance records. BlockID solves this from day one
                — creating a structured, evidence-backed foundation that makes
                companies investable earlier and reduces due diligence friction
                for investors.
              </p>
            </div>
          </section>

          {/* Product: SVI Engine */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">
              The Product: Startup Value Index (SVI)
            </h2>
            <p className="text-base text-ink-600 leading-relaxed mb-6">
              Our proprietary SVI engine scores startups across 8 dimensions
              using AI-powered analysis and real evidence — not self-reported
              surveys. Each analysis produces a comprehensive report with
              actionable recommendations, competitive intelligence, and growth
              scoring.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {SVI_DIMENSIONS.map((dim) => (
                <div
                  key={dim}
                  className="flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-3 py-2.5"
                >
                  <CheckCircle2
                    strokeWidth={1.75}
                    className="h-3.5 w-3.5 text-brand-600 shrink-0"
                  />
                  <span className="text-xs font-medium text-ink-700">
                    {dim}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Investor Features */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-6">
              Investor Tools
            </h2>
            <div className="grid sm:grid-cols-2 gap-5">
              {INVESTOR_FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="rounded-xl border border-surface-200 bg-surface-100 p-5"
                  >
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                      <Icon strokeWidth={1.75} className="h-5 w-5" />
                    </span>
                    <h3 className="mt-3 text-base font-semibold text-ink-800">
                      {f.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-600">
                      {f.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Business Model */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">
              Business Model
            </h2>
            <div className="grid sm:grid-cols-2 gap-6 mb-6">
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                    <Layers strokeWidth={1.75} className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="text-base font-semibold text-ink-800">
                    SaaS + Credit Hybrid
                  </h3>
                </div>
                <p className="text-sm text-ink-600 leading-relaxed">
                  Revenue from monthly subscriptions and pay-per-use credit
                  packs. Founders start free, then convert through usage. Full
                  Stripe integration with automated billing.
                </p>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                    <TrendingUp strokeWidth={1.75} className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="text-base font-semibold text-ink-800">
                    88-99.9% Gross Margins
                  </h3>
                </div>
                <p className="text-sm text-ink-600 leading-relaxed">
                  AI-native platform with minimal marginal cost per analysis.
                  No human analysts required. Infrastructure scales linearly
                  with demand.
                </p>
              </div>
            </div>

            {/* Revenue tiers */}
            <div className="rounded-xl border border-surface-200 overflow-hidden">
              <div className="bg-surface-50 px-5 py-3 border-b border-surface-200">
                <p className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
                  Revenue Tiers
                </p>
              </div>
              <div className="divide-y divide-surface-200">
                {REVENUE_TIERS.map(({ tier, price, detail }) => (
                  <div
                    key={tier}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink-800">
                        {tier}
                      </p>
                      <p className="text-xs text-ink-500">{detail}</p>
                    </div>
                    <span className="text-sm font-bold font-mono text-brand-600">
                      {price}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Traction */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">Traction</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                // 2026-09-10 (T0274): "19 days to build", "57 pages" and
                // "10 free tools" were the June 2026 launch numbers. Each
                // figure below has a source in the repo: /tools lists 16
                // free tools; content/team-roster.json holds 11 C-Level
                // agents; evaluation-criteria.ts scores 13 criteria over
                // 8 dimensions; growth/phase-taxonomy.ts has 12 phases.
                { num: "11", label: "C-Level AI agents" },
                { num: "8 × 13", label: "Dimensions × criteria" },
                { num: "16", label: "Free tools live" },
                { num: "12", label: "Growth phases mapped" },
              ].map(({ num, label }) => (
                <div
                  key={label}
                  className="rounded-xl border border-surface-200 bg-surface-50 p-4 text-center"
                >
                  <p className="text-2xl font-extrabold font-mono tabular-nums text-brand-600">
                    {num}
                  </p>
                  <p className="text-xs text-ink-500 mt-1">{label}</p>
                </div>
              ))}
            </div>
            <ul className="space-y-2.5">
              {[
                "Platform built and deployed with AI-native development by a solo founder and 11 C-Level agents",
                "Complete Stripe integration with the A$3 Trust BizReport, credit packs, and subscriptions",
                "16 free startup tools driving organic traffic and lead generation",
                "SVI analysis engine: 8 dimensions, 13 criteria, 12 growth phases, C-suite review with an auditor",
                "Cap table management, dilution modelling, term sheet generator, data rooms",
                "Evaluator workspace for investors, advisory firms and accelerators — Scout, Firm and Program",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm text-ink-600"
                >
                  <CheckCircle2
                    strokeWidth={1.75}
                    className="h-4 w-4 mt-0.5 shrink-0 text-brand-600"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Team */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">The Team</h2>
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-6">
              <div className="flex items-center gap-4 mb-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white text-lg font-bold">
                  1
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-ink-800">
                    Solo Founder
                  </span>
                  <span className="text-lg text-ink-400">+</span>
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-50 border border-brand-200 px-3 text-sm font-semibold text-brand-700">
                    <Bot strokeWidth={1.75} className="h-4 w-4" /> 11 C-Level agents
                  </span>
                </div>
              </div>
              <p className="text-sm text-ink-600 leading-relaxed">
                An experienced founder who has raised capital, negotiated term
                sheets, and built cap tables from scratch — supported by 11
                C-Level AI agents (CEO, COO, CTO, CFO, CPO, CMO, CRO, CLO, CHRO,
                CDO, CISO) for valuation, market research, R&D eligibility,
                financial modelling, compliance, content, and more, with an
                auditor agent checking their claims. The scoring method is
                grounded in the founder&apos;s doctoral research (DBA) on startup
                valuation. This AI-native approach delivers the output of a
                20+ person team at a fraction of the cost and time.
              </p>
            </div>
          </section>

          {/* The Ask */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">
              What We Are Looking For
            </h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  icon: Users,
                  title: "Strategic Partners",
                  desc: "Accounting firms, law firms, and startup service providers who serve Australian founders.",
                },
                {
                  icon: DollarSign,
                  title: "Angel Investors",
                  desc: "Investors who understand founder tools, SaaS metrics, and the Australian startup ecosystem.",
                },
                {
                  icon: Rocket,
                  title: "Accelerator Partnerships",
                  desc: "Accelerators and incubators looking for portfolio SVI tracking and cohort management tools.",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="rounded-xl border border-surface-200 bg-surface-50 p-5"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600 mb-3">
                    <Icon strokeWidth={1.75} className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="text-sm font-semibold text-ink-800">
                    {title}
                  </h3>
                  <p className="text-xs text-ink-600 mt-1.5 leading-relaxed">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="rounded-2xl border-2 border-brand-400 bg-gradient-to-br from-brand-50 to-white p-8 md:p-10 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Target strokeWidth={1.75} className="h-6 w-6 text-brand-600" />
              <Zap strokeWidth={1.75} className="h-6 w-6 text-brand-600" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-ink-900 mb-3">
              Interested in partnering with BlockID?
            </h2>
            <p className="text-ink-600 mb-6 max-w-lg mx-auto">
              We are looking for strategic partners, angel investors, and
              accelerator partnerships to help bring ownership intelligence to
              every Australian founder.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="mailto:admin@blockid.au?subject=BlockID%20Investment%20Enquiry"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-8 text-sm font-semibold text-white hover:bg-brand-500 transition-colors"
              >
                Schedule a Call{" "}
                <ArrowRight strokeWidth={2} className="h-4 w-4" />
              </a>
              <Link
                href="/contact"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-surface-300 bg-white px-8 text-sm font-semibold text-ink-700 hover:bg-surface-100 transition-colors"
              >
                Contact Us
              </Link>
            </div>
            <p className="mt-4 text-xs text-ink-500">
              Or email us directly at{" "}
              <a
                href="mailto:admin@blockid.au"
                className="text-brand-600 hover:text-brand-500 underline"
              >
                admin@blockid.au
              </a>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
