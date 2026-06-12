import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Version & Features — BlockID.au",
  description: "BlockID.au platform updates, features roadmap, and startup growth path from Day 0 to scale.",
  openGraph: {
    title: "Version & Features — BlockID.au",
    description: "See every feature BlockID.au offers to guide startups from Day 0 to scale.",
  },
};

// ── Growth Phases ──────────────────────────────────────────────────────

const GROWTH_PHASES = [
  {
    phase: 0,
    title: "Day 0 — Idea Stage",
    sviRange: "SVI < 30",
    description: "You have an idea. BlockID helps you validate it, understand your market, and start building evidence.",
    features: [
      { name: "Free SVI Analysis", desc: "Get your Startup Value Index score instantly — understand where you stand", link: "/score" },
      { name: "Idea Valuation Tool", desc: "Pre-incorporation valuation using Berkus + Scorecard methods", link: "/tools/idea-valuation" },
      { name: "AI Mentor Report (Free)", desc: "10-page analysis covering 13 evaluation criteria with step-by-step guidance", link: "/score" },
      { name: "Market Size Analysis", desc: "TAM/SAM/SOM estimation and competitive landscape mapping" },
      { name: "Problem Clarity Assessment", desc: "Evaluate problem-solution fit with evidence-based scoring" },
    ],
    color: "from-gray-500 to-gray-600",
  },
  {
    phase: 1,
    title: "Validation Stage",
    sviRange: "SVI 30–50",
    description: "Validate your idea with real data. Build founder credibility and collect early evidence.",
    features: [
      { name: "Founder Profile Builder", desc: "Showcase experience, skills, and track record for investor readiness" },
      { name: "Evidence Collection", desc: "Upload documents, connect sources — each evidence item strengthens your SVI" },
      { name: "Customer Discovery Framework", desc: "Track customer interviews, surveys, and validation milestones" },
      { name: "Competitive Analysis", desc: "AI-powered competitor mapping across AU startup ecosystem" },
      { name: "SVI Trend Tracking", desc: "Weekly snapshots show your growth trajectory over time" },
    ],
    color: "from-blue-500 to-blue-600",
  },
  {
    phase: 2,
    title: "Build & Equity Stage",
    sviRange: "SVI 50–70",
    description: "Structure your company properly. Build your MVP and set up governance.",
    features: [
      { name: "Cap Table Builder", desc: "Professional equity structure with ESOP, vesting schedules, and SHA" },
      { name: "Vesting Manager", desc: "Track token vesting with cliff periods, milestone-based releases" },
      { name: "Legal Document Templates", desc: "AU-compliant SHA, Constitution, ESOP deeds — guided by CLO agent" },
      { name: "Team Assessment", desc: "CHRO agent evaluates team composition, roles, and hiring gaps" },
      { name: "Code & Tech Audit", desc: "CTO agent reviews GitHub repos — architecture, security, code quality" },
    ],
    color: "from-indigo-500 to-indigo-600",
  },
  {
    phase: 3,
    title: "Fundraise Ready",
    sviRange: "SVI 70–85",
    description: "Prepare for investors. Build your data room and perfect your pitch.",
    features: [
      { name: "Investor Data Room", desc: "Organized document repository — pitch deck, financials, legal docs" },
      { name: "Financial Projections", desc: "Monthly revenue/cost forecasts, break-even timeline, payback period" },
      { name: "Valuation Dashboard", desc: "3-method blended valuation: Berkus + Scorecard + Revenue Multiple" },
      { name: "Pitch Deck Review", desc: "AI-powered analysis of your pitch deck with improvement suggestions" },
      { name: "Investor Readiness Score", desc: "Detailed checklist of what investors look for at each stage" },
    ],
    color: "from-purple-500 to-purple-600",
  },
  {
    phase: 4,
    title: "Traction & Revenue",
    sviRange: "SVI 85–120",
    description: "You have customers and revenue. Optimize your metrics and scale.",
    features: [
      { name: "Revenue Dashboard", desc: "Real-time P&L, expense breakdown, Stripe integration" },
      { name: "Metrics Tracker", desc: "MRR/ARR, MAU/DAU, retention curves, NPS — stage-aware benchmarks" },
      { name: "Unit Economics Analysis", desc: "CAC, LTV, payback period with industry benchmarks" },
      { name: "Market Capture Projections", desc: "Monthly TAM penetration forecasts with growth scenarios" },
      { name: "SVI Market Index", desc: "Unbounded index (Nikkei-style) that grows as you add more data" },
    ],
    color: "from-emerald-500 to-emerald-600",
  },
  {
    phase: 5,
    title: "Growth & Scale",
    sviRange: "SVI 120+",
    description: "Scale your operations. Model exit scenarios and optimize for maximum value.",
    features: [
      { name: "Exit Modeling", desc: "Acquisition and IPO scenario analysis with per-shareholder payouts" },
      { name: "Dividend Distribution", desc: "Calculate and manage dividend payments across cap table" },
      { name: "Blockchain Token Registry", desc: "NASDAQ-style equity tokens on private EVM blockchain" },
      { name: "Multi-Agent Reports", desc: "10 C-Level AI agents produce comprehensive business intelligence" },
      { name: "Board Memo Generator", desc: "Professional board reports with financials, metrics, and strategy" },
    ],
    color: "from-amber-500 to-amber-600",
  },
];

// ── Version History ────────────────────────────────────────────────────

const VERSION_HISTORY = [
  {
    version: "2.5.0",
    date: "2026-06-12",
    title: "CEO Goal Tree & SVI Market Index",
    changes: [
      "CEO Goal dashboard with 10 C-Level agent status tracking",
      "SVI Market Index — unbounded Nikkei/Dow Jones style scoring",
      "Financial projection engine (monthly forecasts, break-even, payback period)",
      "Agent daily report pipeline — auto-generated per-agent status files",
      "Telegram daily summary with deploy tracking and agent health",
      "Version & Features page with growth path layout",
    ],
  },
  {
    version: "2.4.0",
    date: "2026-06-12",
    title: "GitHub CI/CD & Cron Infrastructure",
    changes: [
      "GitHub webhook auto-deploy on push to master",
      "Monitored cron runner with Telegram failure alerts",
      "Cron health dashboard (19 routines tracked)",
      "Lifecycle email policy — max 4 emails per user ever",
      "Email unsubscribe mechanism in all automated emails",
    ],
  },
  {
    version: "2.3.0",
    date: "2026-06-01",
    title: "AI Model Auto-Discovery",
    changes: [
      "Daily auto-discovery of top-5 strongest FREE AI models per provider",
      "Per-model cooldown to avoid 429/404 retry spam",
      "AI budget tracking with monthly $100 cap",
      "Codex OAuth integration for enhanced code analysis",
    ],
  },
  {
    version: "2.2.0",
    date: "2026-05-15",
    title: "Blockchain Explorer & Wallet",
    changes: [
      "Private EVM blockchain (Anvil, Chain ID 420) with Otterscan explorer",
      "MetaMask wallet integration for equity token management",
      "Token factory smart contract for NASDAQ-style equity tokens",
      "Vesting schedule on-chain sync (off-chain first, optional blockchain)",
    ],
  },
  {
    version: "2.1.0",
    date: "2026-05-01",
    title: "13-Criteria SVI & Agent Ecosystem",
    changes: [
      "13 evaluation criteria covering all aspects of startup health",
      "10 C-Level AI agents: CTO, CFO, CPO, CMO, CRO, CLO, CHRO, CISO, CDO, COO",
      "Multi-agent report generation with DOCX export",
      "Agent self-research with knowledge base storage",
      "Credit system with transparent pricing",
    ],
  },
  {
    version: "2.0.0",
    date: "2026-04-15",
    title: "SVI v2 — Open-Ended Index",
    changes: [
      "SVI base 100 with no upper limit",
      "8 weighted dimensions (FTV, MPC, PTD, TRE, CGH, IRI, LCO, SVM)",
      "Evidence confidence levels (self-declared → third-party verified)",
      "Risk penalties (15 categories)",
      "Stage detection (0-7: Concept → Corporation)",
      "Berkus + Scorecard + Revenue Multiple valuation blend",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-03-01",
    title: "BlockID.au Launch",
    changes: [
      "Startup Value Index (SVI) — first Australian startup scoring platform",
      "AI-powered analysis from pitch deck, website, and text input",
      "Free tier with 10-page reports",
      "Paid premium reports with unlimited depth",
      "Stripe billing integration",
    ],
  },
];

export default function VersionPage() {
  return (
    <div className="min-h-svh bg-surface-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-brand-600 to-brand-700 text-white py-16">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-3">BlockID.au — Features & Updates</h1>
          <p className="text-lg opacity-90 max-w-2xl mx-auto">
            Everything you need to answer: <strong>Where am I now? What am I worth? What should I do next?</strong>
          </p>
          <p className="text-sm opacity-70 mt-2">
            Organized by your startup&apos;s growth path — from Day 0 to scale
          </p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-16">
        {/* Growth Path Features */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Growth Path</h2>
          <p className="text-gray-600 mb-8">
            BlockID guides you step-by-step through every stage of your startup journey.
            Each phase unlocks features designed for where you are right now.
          </p>

          <div className="space-y-8">
            {GROWTH_PHASES.map((phase) => (
              <div key={phase.phase} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className={`bg-gradient-to-r ${phase.color} px-6 py-4 text-white`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold">{phase.title}</h3>
                      <p className="text-sm opacity-80">{phase.description}</p>
                    </div>
                    <span className="text-xs bg-white/20 px-3 py-1 rounded-full font-medium shrink-0 ml-4">
                      {phase.sviRange}
                    </span>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {phase.features.map((feature) => (
                      <div key={feature.name} className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-2 shrink-0" />
                        <div>
                          {feature.link ? (
                            <Link href={feature.link} className="text-sm font-semibold text-brand-700 hover:underline">
                              {feature.name}
                            </Link>
                          ) : (
                            <p className="text-sm font-semibold text-gray-900">{feature.name}</p>
                          )}
                          <p className="text-xs text-gray-600">{feature.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* AI Agent Ecosystem */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">10 C-Level AI Agents</h2>
          <p className="text-gray-600 mb-6">
            Your virtual board of directors. Each agent specializes in a domain and works daily to improve both the platform and your startup reports.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { role: "CTO", focus: "Tech & Code" },
              { role: "CFO", focus: "Finance & Revenue" },
              { role: "CPO", focus: "Product & Roadmap" },
              { role: "CMO", focus: "Marketing & Growth" },
              { role: "CRO", focus: "Conversion & Retention" },
              { role: "CLO", focus: "Legal & Compliance" },
              { role: "CHRO", focus: "Team & Culture" },
              { role: "CISO", focus: "Security" },
              { role: "CDO", focus: "Data & AI" },
              { role: "COO", focus: "Operations & QA" },
            ].map((agent) => (
              <div key={agent.role} className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
                <p className="text-sm font-bold text-brand-700">{agent.role}</p>
                <p className="text-[10px] text-gray-500">{agent.focus}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Version History */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Version History</h2>
          <p className="text-gray-600 mb-6">
            Every update, new feature, and improvement — tracked over time.
          </p>

          <div className="space-y-6">
            {VERSION_HISTORY.map((release) => (
              <div key={release.version} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-mono font-bold">
                    v{release.version}
                  </span>
                  <span className="text-xs text-gray-500">{release.date}</span>
                  <h3 className="text-sm font-semibold text-gray-900">{release.title}</h3>
                </div>
                <ul className="space-y-1">
                  {release.changes.map((change, i) => (
                    <li key={i} className="flex gap-2 text-xs text-gray-700">
                      <span className="text-brand-500 mt-0.5">+</span>
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="text-center bg-gradient-to-r from-brand-50 to-purple-50 rounded-2xl p-8 border border-brand-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ready to start?</h2>
          <p className="text-gray-600 mb-6">
            Get your free SVI analysis and discover where your startup stands today.
          </p>
          <Link
            href="/score"
            className="inline-block bg-brand-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-700 transition-colors"
          >
            Get Your Free SVI Score
          </Link>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 text-center text-xs text-gray-500">
        <p>&copy; {new Date().getFullYear()} Auschain PTY LTD (ACN 659 615 111) — BlockID.au</p>
      </footer>
    </div>
  );
}
