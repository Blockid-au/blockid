import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";
import { LogoCloud } from "@/components/landing/logo-cloud";
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
  { num: "200+", label: "Australian startups" },
  { num: "A$2M+", label: "Funding facilitated" },
  { num: "95%", label: "User satisfaction" },
  { num: "7 days", label: "Average to investor-ready" },
  { num: "10", label: "Free startup tools" },
  { num: "8", label: "AI-powered agents" },
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
    <MarketingShell>
      <MarketingHero
        eyebrow="About BlockID.au"
        title={
          <>
            Helping Australian founders build{" "}
            <span className="bg-gradient-to-r from-[#00D4FF] to-[#0066FF] bg-clip-text text-transparent">
              valuable, investable
            </span>{" "}
            businesses from day one
          </>
        }
        subtitle="BlockID is an AI-powered startup valuation and ownership intelligence platform. We give founders the clarity, confidence, and tools to move from idea to investable business — with evidence-backed scoring, not guesswork."
      />

      <div className="mx-auto max-w-4xl px-6 pb-20 space-y-16">
        {/* Mission */}
        <section>
          <h2 className="text-2xl font-bold text-[#F8FAFC] mb-4">
            Our Mission
          </h2>
          <p className="text-lg leading-relaxed text-[#94A3B8]">
            Too many startups lose momentum — and equity — because cap tables
            live in spreadsheets, valuations are guesswork, and fundraising
            readiness is an afterthought. We believe every Australian founder
            deserves institutional-grade tools to build, protect, and grow
            their company. BlockID exists to close that gap.
          </p>
        </section>

        {/* What We Do */}
        <section>
          <h2 className="text-2xl font-bold text-[#F8FAFC] mb-4">
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
                className="flex items-start gap-3 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm p-4 transition-all duration-300 hover:border-[rgba(0,212,255,0.3)] hover:scale-[1.02]"
              >
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(0,212,255,0.15)] text-[#00D4FF]">
                  <Icon strokeWidth={1.75} className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#F8FAFC]">
                    {label}
                  </p>
                  <p className="text-xs text-[#94A3B8] mt-0.5 leading-relaxed">
                    {detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Our Approach */}
        <section>
          <h2 className="text-2xl font-bold text-[#F8FAFC] mb-6">
            Our Approach
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {APPROACH_ITEMS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(0,212,255,0.15)] text-[#00D4FF]">
                    <Icon strokeWidth={1.75} className="h-5 w-5" />
                  </span>
                  <h3 className="text-base font-semibold text-[#F8FAFC]">
                    {title}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-[#94A3B8]">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The Team */}
        <section>
          <h2 className="text-2xl font-bold text-[#F8FAFC] mb-4">The Team</h2>
          <p className="text-base leading-relaxed text-[#94A3B8] mb-4">
            BlockID was built by an experienced founder who has lived the
            startup journey — raising capital, negotiating term sheets, and
            building cap tables from scratch. Instead of assembling a
            traditional team of dozens, BlockID is powered by 11 specialized
            C-Level AI agents (CTO, CFO, CPO, CMO, CRO, CLO, CHRO, CISO, CDO,
            COO, plus a Customer Success lead), each purpose-built for a
            critical domain: valuation, competitive research, R&D eligibility,
            financial modelling, compliance, and more.
          </p>
          <p className="text-base leading-relaxed text-[#94A3B8]">
            The result: a platform that would typically require a team of 20+
            engineers, delivered with the speed and precision of AI-native
            development. The current build — v3.4.0 — spans 340+ TypeScript
            files, 65+ pages, 90+ API endpoints, 47 database tables, 11 AI
            agents, and 40+ free models. Recent shipping includes the full
            founder workspace (competitors, GTM strategy, pricing tiers,
            roadmap builder, team planner — migration 0304), the reseller /
            wholesale module (P0–P13, login fix + welcome email + GA events),
            STRIPE_PRICE_STARTUP_PACKAGE checkout (A$149 one-off), AI model
            updates (Sonnet 4.6 / Haiku 4.5 / Opus 4.7) with an optimized
            free-tier provider chain (Cerebras → Groq → SambaNova, 128 socket
            pool, 0.18s p95), and the Startup Package guided journey (13
            sub-goals, Playwright smoke gate).
          </p>
        </section>

        {/* Platform Stats */}
        <section>
          <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm px-6 py-8">
            <p className="text-center text-xs uppercase tracking-[0.15em] text-[#00D4FF] font-medium mb-6">
              Platform at a glance
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
              {STATS.map(({ num, label }) => (
                <div key={label} className="text-center">
                  <p className="text-2xl font-extrabold font-mono tabular-nums bg-gradient-to-r from-[#00D4FF] to-[#0066FF] bg-clip-text text-transparent">
                    {num}
                  </p>
                  <p className="text-xs text-[#94A3B8] mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Australian-Native */}
        <section>
          <h2 className="text-2xl font-bold text-[#F8FAFC] mb-4">
            Australian-Native
          </h2>
          <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm p-6">
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
                  className="flex items-start gap-2.5 text-sm text-[#94A3B8]"
                >
                  <CheckCircle2
                    strokeWidth={1.75}
                    className="h-4 w-4 mt-0.5 shrink-0 text-[#00D4FF]"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* Curator-controlled accelerator strip */}
      <LogoCloud group="accepted" className="mb-14" />

      <MarketingCtaStrip
        headline="Get your free Startup Value Index analysis in under 60 seconds."
        primary={{ href: "/", label: "Get Your Free SVI" }}
        secondary={{ href: "/contact", label: "Contact Us" }}
      />
    </MarketingShell>
  );
}
