import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import {
  Bot,
  CheckCircle2,
  Code2,
  FileText,
  Globe,
  LayoutDashboard,
  Scale,
  Shield,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "About BlockID — AI-Powered Startup Ownership Platform",
  description:
    "BlockID helps Australian founders build valuable, investable businesses from day one with AI-powered valuation, ownership intelligence, and investor-readiness tools.",
  alternates: {
    canonical: "https://blockid.au/about",
  },
};

const STATS = [
  { num: "272+", label: "TypeScript files" },
  { num: "57", label: "Pages" },
  { num: "70", label: "API endpoints" },
  { num: "41", label: "Database tables" },
  { num: "10", label: "Free tools" },
  { num: "8", label: "AI agents" },
];

const APPROACH_ITEMS = [
  {
    icon: Shield,
    title: "Evidence-Backed Scoring",
    desc: "Every SVI dimension is scored against real evidence — ABN registrations, financial data, team structure, market signals — not self-reported surveys.",
  },
  {
    icon: Scale,
    title: "Australian Regulatory Compliance",
    desc: "Built for ABN, ASIC, ESIC, R&D Tax Incentive, and ESOP structures under Australian law. Your data is hosted with Australian residency.",
  },
  {
    icon: Bot,
    title: "8 Specialized AI Agents",
    desc: "From competitive research to R&D eligibility, each agent is purpose-built for a specific domain — delivering institutional-grade analysis at startup speed.",
  },
  {
    icon: TrendingUp,
    title: "Startup Value Index (SVI)",
    desc: "Our proprietary 8-dimension scoring engine tracks your startup across team, market, product, traction, financials, legal, IP, and investor readiness.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-4xl px-6">
          {/* Hero */}
          <div className="text-center mb-16">
            <p className="text-sm uppercase tracking-[0.15em] text-brand-600 font-medium mb-3">
              About BlockID.au
            </p>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-ink-900 leading-tight">
              Helping Australian founders build{" "}
              <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
                valuable, investable
              </span>{" "}
              businesses from day one
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-600 max-w-2xl mx-auto">
              BlockID is an AI-powered startup valuation and ownership
              intelligence platform. We give founders the clarity, confidence,
              and tools to move from idea to investable business — with
              evidence-backed scoring, not guesswork.
            </p>
          </div>

          {/* Mission */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">
              Our Mission
            </h2>
            <p className="text-lg leading-relaxed text-ink-600">
              Too many startups lose momentum — and equity — because cap tables
              live in spreadsheets, valuations are guesswork, and fundraising
              readiness is an afterthought. We believe every Australian founder
              deserves institutional-grade tools to build, protect, and grow
              their company. BlockID exists to close that gap.
            </p>
          </section>

          {/* What We Do */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">
              What We Do
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                {
                  icon: Target,
                  label: "Startup Value Index (SVI)",
                  detail:
                    "8-dimension AI scoring that tracks viability from idea to scale",
                },
                {
                  icon: LayoutDashboard,
                  label: "Cap Table & Ownership",
                  detail:
                    "Model equity splits, dilution scenarios, and vesting schedules",
                },
                {
                  icon: FileText,
                  label: "Investor-Ready Documents",
                  detail:
                    "Data rooms, term sheets, and export packs for due diligence",
                },
                {
                  icon: Globe,
                  label: "AU Compliance Tools",
                  detail:
                    "ESIC eligibility checker, R&D tax calculator, ASIC tracking",
                },
                {
                  icon: Zap,
                  label: "AI-Powered Analysis",
                  detail:
                    "Competitive research, market sizing, and growth scoring in seconds",
                },
                {
                  icon: Code2,
                  label: "10 Free Startup Tools",
                  detail:
                    "Idea valuation, equity split, funding plan, dilution modelling, and more",
                },
              ].map(({ icon: Icon, label, detail }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 rounded-xl border border-surface-200 bg-surface-50 p-4"
                >
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                    <Icon strokeWidth={1.75} className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-800">
                      {label}
                    </p>
                    <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">
                      {detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Our Approach */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-6">
              Our Approach
            </h2>
            <div className="grid sm:grid-cols-2 gap-6">
              {APPROACH_ITEMS.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                      <Icon strokeWidth={1.75} className="h-5 w-5" />
                    </span>
                    <h3 className="text-base font-semibold text-ink-800">
                      {title}
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-600">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* The Team */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">The Team</h2>
            <p className="text-base leading-relaxed text-ink-600 mb-4">
              BlockID was built by an experienced founder who has lived the
              startup journey — raising capital, negotiating term sheets, and
              building cap tables from scratch. Instead of assembling a
              traditional team of dozens, BlockID is powered by 8 specialized AI
              agents, each purpose-built for a critical domain: valuation,
              competitive research, R&D eligibility, financial modelling,
              compliance, and more.
            </p>
            <p className="text-base leading-relaxed text-ink-600">
              The result: a platform that would typically require a team of 20+
              engineers, delivered with the speed and precision of AI-native
              development. The entire platform — 340+ TypeScript files, 65+ pages,
              90+ API endpoints, 47 database tables, 11 AI agents, 40+ free models — was built in 30 days.
            </p>
          </section>

          {/* Platform Stats */}
          <section className="mb-14">
            <div className="rounded-2xl border border-surface-200 bg-surface-50 px-6 py-8">
              <p className="text-center text-xs uppercase tracking-[0.15em] text-brand-600 font-medium mb-6">
                Platform at a glance
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                {STATS.map(({ num, label }) => (
                  <div key={label} className="text-center">
                    <p className="text-2xl font-extrabold font-mono tabular-nums text-brand-600">
                      {num}
                    </p>
                    <p className="text-xs text-ink-500 mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Australian-Native */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">
              Australian-Native
            </h2>
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-6">
              <ul className="space-y-3">
                {[
                  "Auschain Pty Ltd (ACN 659 615 111, ABN 79 659 615 111)",
                  "Headquartered in Sydney, NSW, Australia",
                  "Data hosted with Australian residency",
                  "Compliance frameworks built for ASIC and ATO requirements",
                  "Tools built for Australian regulations: ESOP structures, SAFE notes under local law, R&D Tax Incentive, ESIC",
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
            </div>
          </section>

          {/* CTA */}
          <section className="rounded-2xl border border-brand-500/20 bg-brand-600/5 p-8 text-center">
            <h2 className="text-2xl font-bold text-ink-800 mb-3">
              Ready to get started?
            </h2>
            <p className="text-ink-600 mb-6 max-w-lg mx-auto">
              Get your free Startup Value Index analysis in under 60 seconds.
              No signup required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-500 transition-colors"
              >
                Get Your Free SVI
              </Link>
              <Link
                href="/contact"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-surface-300 bg-surface-50 dark:bg-surface-200 px-6 text-sm font-semibold text-ink-700 hover:bg-surface-100 transition-colors"
              >
                Contact Us
              </Link>
            </div>
            <p className="mt-4 text-xs text-ink-500">
              Questions? Reach us at{" "}
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
