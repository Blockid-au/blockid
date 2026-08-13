import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { JOURNEY_VOCAB_VERSION } from "@/lib/journey-vocabulary";
import {
  getPlatformConfig,
  founding_price_aud,
  growth_price_monthly_aud,
} from "@/lib/platform-config";

export const metadata: Metadata = {
  title: "BlockID Platform Docs — Company, Roadmap, Team, SVI & Founding 100",
  description:
    "Public entry point to BlockID.au platform documentation — company overview, product roadmap, the 11-role AI C-Level team, the 8-dimension Startup Value Index (SVI), Founding 100 lifetime deal, plus plan deltas and the canonical journey vocabulary.",
  alternates: {
    canonical: "https://blockid.au/docs",
  },
};

// ---------------------------------------------------------------------------
// Recently-updated plan/audit docs. Update on deploy.
// ---------------------------------------------------------------------------

type DocEntry = {
  slug: string;
  title: string;
  updated: string;
  summary: string;
};

const RECENTLY_UPDATED_DOCS: DocEntry[] = [
  {
    slug: "docs/ARCHITECTURE.md",
    title: "System Architecture (v3.3.2) — Stack + Architecture Diagrams",
    updated: "2026-08-07",
    summary:
      "Mermaid diagrams for the full BlockID.au stack (Cloudflare → Nginx → Next.js 16 standalone → Supabase/Redis/Stripe → AI fallback chain) and the App Router request path. Includes the SVI enrichment pipeline and admin drill-down surfaces.",
  },
  {
    slug: "docs/TEAM_STRUCTURE.md",
    title: "Team Structure (v3.3.2) — C-Level AI Agent Org Chart",
    updated: "2026-08-07",
    summary:
      "Mermaid org chart of the 11-member C-Level AI agent roster (CTO/CFO/CPO/CMO/CRO/CLO/CHRO/CISO/CDO/COO + Customer Success), plus reporting cadence for Guardian, QA, and auto-deploy. Roster source of truth: web/content/team-roster.json.",
  },
  {
    slug: "docs/plans/real-world-workflow-parity-audit-2026-07-23.md",
    title: "Real-World Workflow Parity Audit (2026-07-23)",
    updated: "2026-07-23",
    summary:
      "Audits every surface, taxonomy, and data-room checklist against real Atlassian, Canva, Airwallex, Xero, and Culture Amp journeys — the seed for the canonical 8-stage journey vocabulary.",
  },
  {
    slug: "docs/plans/plan-delta-2026-07-23.md",
    title: "Reseller Module Plan Delta (2026-07-23)",
    updated: "2026-07-23",
    summary:
      "Consolidates 20 blocking findings from CTO, CFO, CISO, and CLO into concrete plan-file amendments; P1 migrations 0091+ stay blocked until every blocker returns allow.",
  },
];

// ---------------------------------------------------------------------------
// Startup Value Index (SVI) — 8 canonical dimensions. Weights are read live
// from platform-config (admin editable at /admin/config); the descriptions
// below stay static because they define the framework itself.
// ---------------------------------------------------------------------------

type SviDimension = {
  code: "ftv" | "mpc" | "ptd" | "tre" | "cgh" | "iri" | "lco" | "svm";
  name: string;
  blurb: string;
};

const SVI_DIMENSIONS: SviDimension[] = [
  {
    code: "ftv",
    name: "Founder-Team Viability",
    blurb:
      "Founder-market fit, complementary skills, resilience, and full-time commitment.",
  },
  {
    code: "mpc",
    name: "Market & Problem Clarity",
    blurb:
      "TAM/SAM/SOM sanity, ICP crispness, and whether the pain is acute enough to pay.",
  },
  {
    code: "ptd",
    name: "Product & Tech Depth",
    blurb:
      "Defensibility of the build — architecture, data moat, IP, and shipping cadence.",
  },
  {
    code: "tre",
    name: "Traction & Revenue Evidence",
    blurb:
      "Signed LOIs, paid pilots, MRR/ARR, retention curves and organic pull.",
  },
  {
    code: "cgh",
    name: "Capital & Growth Health",
    blurb:
      "Burn, runway, unit economics, CAC payback, and sensible dilution history.",
  },
  {
    code: "iri",
    name: "IP, Risk & Industry",
    blurb:
      "Regulatory exposure, IP position, key-person risk, and industry tailwinds.",
  },
  {
    code: "lco",
    name: "Legal & Compliance",
    blurb:
      "ASIC hygiene, ESIC/R&D eligibility, ESOP scheme rules, GST/Div 83A, s708 offers.",
  },
  {
    code: "svm",
    name: "SVI Momentum",
    blurb:
      "Trajectory: how the seven dimensions have moved over the last N snapshots.",
  },
];

// ---------------------------------------------------------------------------
// Roadmap highlights — condensed from docs/ROADMAP.md + web/CHANGELOG.md.
// Kept short here; the full living document lives in the repo.
// ---------------------------------------------------------------------------

type RoadmapItem = { title: string; note: string };

const SHIPPED_HIGHLIGHTS: RoadmapItem[] = [
  {
    title: "Startup Package Ship 1 (Phase 3.0)",
    note:
      "Guided founder journey Idea → SVI → dataroom → reserved cap-table in a single Stripe SKU (A$149 + 25 seed credits). 8-step interview, per-step agent dispatch, live SVI recompute, auto-fill deliverables, public /startup/[slug] listing.",
  },
  {
    title: "Reseller / wholesale module v1 (Phase 2.7)",
    note:
      "Full admin surface, weekly digest snapshot pipeline (delta, top-movers, streaks, contribution_margin_pct), account_type enum + impersonation trail, k-anon suppression on aggregate metrics.",
  },
  {
    title: "Compliance forms (Phase 2.8)",
    note:
      "Founder-facing GST threshold, s708(1) small-scale personal-offer counter engine, ESIC/s708/GST/R&D deep-link pages, WGEA + Modern Slavery threshold detectors, Div 83A ESOP scheme-rules gate.",
  },
  {
    title: "Exit-readiness tile (Phase 2.9)",
    note:
      "Per-phase InvestorReadinessTile on /dashboard/svi, weekly founder digest cron, AU comparable-exits data source wired into ch09 investor pack and CFO valuation.",
  },
  {
    title: "Enhanced SVI + Multi-Agent Reports (Phase 2.5)",
    note:
      "13-criterion evaluation, 3-phase report generation (Gather → Analyze → Synthesize), 21 sections with agent ownership, DOCX/PDF export with brand styling, 9 AI providers.",
  },
  {
    title: "Founding 100 auto-cutover (v3.3.2 — 2026-09-01)",
    note:
      "Hard-coded promo end in lib/founding-promo.ts; checkout 410, page redirect, webhook + reconcile guards; grandfathered buyers keep access on the legacy plan.",
  },
];

const UPCOMING: RoadmapItem[] = [
  {
    title: "Startup Package Ship 2 (Phase 3.1)",
    note:
      "On-chain token mint, Remotion pitch videos (1-min / 3-min), custom subdomain hosting [slug].blockid.au, ABN + trademark guide, accelerator apply drafter, HubSpot/Zapier CRM link, 90-day-revenue tracker tile, conference recommender.",
  },
  {
    title: "Phase 4 — Scale (Aug–Oct 2026)",
    note:
      "Investor heat scoring, multi-entity cap table, custom branding for Growth plan, public API access via developer portal, enterprise webhooks, onboarding automation.",
  },
  {
    title: "Phase 5 — Ecosystem (Q4 2026+)",
    note:
      "Investor marketplace (after 100 paying users), secondary liquidity tools, optional blockchain anchoring, community features, AI co-pilot for fundraising prep.",
  },
];

// ---------------------------------------------------------------------------
// C-Level agent roster — source of truth web/content/team-roster.json.
// 11 active agents; each is a specialised AI that runs its own research /
// build / report cron and reports to the CEO orchestrator.
// ---------------------------------------------------------------------------

type Advisor = { role: string; name: string; scope: string };

const ADVISORS: Advisor[] = [
  { role: "CEO", name: "CEO Orchestrator", scope: "Strategy + routing across all C-Level agents; owns the 30-day validation-MVP goal." },
  { role: "COO", name: "COO Agent", scope: "Sprint plan, cross-team coordination, release management, operational metrics." },
  { role: "CTO", name: "CTO Agent", scope: "Platform + infra, next-best-action engine, cost modelling, feature delivery." },
  { role: "CFO", name: "CFO Agent", scope: "Valuation engine, financial projections, unit economics, ESOP scoring." },
  { role: "CPO", name: "CPO Agent", scope: "Product strategy, SCN journey mapping, feature prioritisation, onboarding." },
  { role: "CMO", name: "CMO Agent", scope: "Market research, content pillars, SEO insights, competitor analysis." },
  { role: "CRO", name: "CRO Agent", scope: "Conversion optimisation, funnel A/B tests, retention, activation." },
  { role: "CLO", name: "CLO Agent", scope: "ASIC, ESIC, R&D Tax Incentive, term sheets, IP, trademarks, s708 offers." },
  { role: "CHRO", name: "CHRO Agent", scope: "Hiring plans, salary benchmarks, ESOP grants, culture, retention." },
  { role: "CISO", name: "CISO Agent", scope: "Essential Eight, SOC2-lite, secret handling, incident response." },
  { role: "CDO", name: "CDO Agent", scope: "Data quality gates, cohort percentile modelling, analytics governance." },
  { role: "CS", name: "Customer Success Lead", scope: "Onboarding, NPS, churn prevention, support escalation." },
];

const WORKFLOW_DOCS: DocEntry[] = [
  {
    slug: "docs/plans/reseller-module-plan.md",
    title: "Reseller Module Plan",
    updated: "in-flight",
    summary:
      "The active P10 reseller wire-shape and admin-surface programme; each tick lands one pin, mirrored across admin-resellers-list and admin-reseller-detail.",
  },
  {
    slug: "docs/plans/reseller-module-goal.md",
    title: "Reseller Module Goal",
    updated: "in-flight",
    summary:
      "Goal-state definition and acceptance gates for the reseller programme — used by the COO loop to decide when a phase is complete.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DocsPage() {
  const cfg = await getPlatformConfig();
  const foundingPrice = founding_price_aud(cfg);
  const growthMonthly = growth_price_monthly_aud(cfg);
  const foundingSpots = cfg.founding_spots_total;
  const foundingCredits = cfg.founding_credits;
  const promoDeadline = cfg.early_bird_deadline;
  const weights = cfg.svi_weights;

  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-4xl px-6">
          {/* Hero */}
          <div className="text-center mb-14">
            <p className="text-sm uppercase tracking-[0.15em] text-brand-600 font-medium mb-3">
              Platform docs
            </p>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-ink-900 leading-tight">
              BlockID.au —{" "}
              <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
                Startup Verification Intelligence
              </span>{" "}
              for Australian founders
            </h1>
            <p className="mt-6 text-base md:text-lg leading-relaxed text-ink-600 max-w-2xl mx-auto">
              Company overview, product roadmap, the AI C-Level team, the 8-dimension
              Startup Value Index (SVI), and the Founding {foundingSpots} lifetime deal —
              plus the plan deltas and canonical journey vocabulary that keep the
              autonomous agent fleet on the same page.
            </p>
          </div>

          {/* Company / product overview */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              What BlockID.au is
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              BlockID.au is a config-driven verification and readiness platform for
              Australian startups. It runs a founder through a guided journey —
              Idea → Validation → MVP / Early Revenue → Seed → Series A → Series B/C
              → Late-stage → Public / Exit — and continuously scores their startup
              on the proprietary <strong>Startup Value Index (SVI)</strong>. Every
              output (dataroom, cap-table reservation, investor pack, compliance
              form) is generated by a specialised AI C-Level agent and priced in
              credits.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-sm font-semibold text-ink-800 mb-1">Mission</p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Give every Australian founder the verification, benchmarking and
                  compliance rigour that used to be reserved for VC-backed teams.
                </p>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  Operating model
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  One human founder plus an autonomous fleet of AI C-Level agents.
                  Cron loops research, build, ship, and self-report; the founder
                  approves via Telegram and{" "}
                  <code>/dashboard/admin</code>.
                </p>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  Positioning
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  The <strong>BlockID Startup Value Index&trade;</strong> is our
                  proprietary moat — an 8-dimension score used by founders,
                  investors and accelerators to compare AU startups apples-to-apples.
                </p>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  Architecture
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Config-driven — pricing, credit costs, SVI weights and feature
                  flags live in <code>platform_config</code> and are editable at{" "}
                  <code>/admin/config</code> without redeploy.
                </p>
              </div>
            </div>
          </section>

          {/* Startup Value Index */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Startup Value Index&trade; (SVI) — 8 dimensions
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              The SVI is BlockID&apos;s proprietary scoring framework. Every
              startup profile is graded on 8 weighted dimensions; weights are
              live-editable via <code>/admin/config</code> and default to the
              values below. See <Link href="/svi" className="text-brand-600 underline">/svi</Link>{" "}
              for the full explainer and{" "}
              <Link href="/index" className="text-brand-600 underline">/index</Link>{" "}
              for the public AU startup index.
            </p>
            <div className="rounded-xl border border-surface-200 bg-surface-50 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-100 text-ink-700">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold w-16">Code</th>
                    <th className="text-left px-4 py-2 font-semibold">Dimension</th>
                    <th className="text-left px-4 py-2 font-semibold hidden md:table-cell">
                      What it measures
                    </th>
                    <th className="text-right px-4 py-2 font-semibold w-20">
                      Weight
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SVI_DIMENSIONS.map((d) => (
                    <tr
                      key={d.code}
                      className="border-t border-surface-200 align-top"
                    >
                      <td className="px-4 py-2 font-mono text-xs uppercase text-brand-600">
                        {d.code}
                      </td>
                      <td className="px-4 py-2 font-medium text-ink-800">
                        {d.name}
                      </td>
                      <td className="px-4 py-2 text-ink-600 hidden md:table-cell">
                        {d.blurb}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-ink-700">
                        {weights[d.code]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-500 mt-3">
              Weights are pulled live from <code>platform_config.svi_weights</code>.
              The stage mapper (<code>sviStageToCanonical()</code>) projects the
              composite score onto the 8-stage canonical journey vocabulary.
            </p>
          </section>

          {/* Founding 100 */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Founding {foundingSpots} lifetime deal — {foundingPrice}
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              The Founding {foundingSpots} plan is a one-off lifetime purchase at{" "}
              <strong>{foundingPrice}</strong> that grants{" "}
              <strong>{foundingCredits} SVI-analysis credits</strong> and permanent
              access to the platform. It exists to seed the first cohort of
              Australian founders and to feed the public AU startup index.
            </p>
            <div className="rounded-xl border border-brand-500/40 bg-surface-50 p-5">
              <p className="text-sm text-ink-700 mb-2">
                <strong>Price ladder</strong> (deliberately escalating so
                early-buyers keep an edge):
              </p>
              <ul className="text-sm text-ink-600 space-y-1 list-disc list-inside">
                <li>A$1 — launch (2026-06-17)</li>
                <li>A$3 — first bump (2026-06-21)</li>
                <li>
                  <strong>{foundingPrice}</strong> — current, promo through{" "}
                  <span className="font-mono">{promoDeadline}</span>
                </li>
                <li>
                  {growthMonthly} — reverts to the standard Growth plan after
                  cutover (2026-09-01)
                </li>
              </ul>
              <p className="text-xs text-ink-500 mt-3">
                Cutover is hard-coded in <code>lib/founding-promo.ts</code> so a
                Supabase outage cannot accidentally re-open the promo. Grandfathered
                Founding {foundingSpots} buyers keep their access on the legacy plan.
              </p>
            </div>
          </section>

          {/* Roadmap */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Product roadmap
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              Condensed from <code>docs/ROADMAP.md</code> and{" "}
              <code>web/CHANGELOG.md</code>. See{" "}
              <Link href="/roadmap" className="text-brand-600 underline">
                /roadmap
              </Link>{" "}
              for the live 8-stage view with entry / exit criteria.
            </p>

            <h3 className="text-lg font-semibold text-ink-800 mb-2">
              Shipped highlights
            </h3>
            <ul className="space-y-2 mb-6">
              {SHIPPED_HIGHLIGHTS.map((item) => (
                <li
                  key={item.title}
                  className="rounded-lg border border-emerald-200/70 bg-emerald-50/40 p-4"
                >
                  <p className="text-sm font-semibold text-ink-800">
                    {item.title}
                  </p>
                  <p className="text-xs text-ink-600 leading-relaxed mt-1">
                    {item.note}
                  </p>
                </li>
              ))}
            </ul>

            <h3 className="text-lg font-semibold text-ink-800 mb-2">
              Upcoming
            </h3>
            <ul className="space-y-2">
              {UPCOMING.map((item) => (
                <li
                  key={item.title}
                  className="rounded-lg border border-surface-200 bg-surface-50 p-4"
                >
                  <p className="text-sm font-semibold text-ink-800">
                    {item.title}
                  </p>
                  <p className="text-xs text-ink-600 leading-relaxed mt-1">
                    {item.note}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* Team */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Team — AI C-Level roster
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              BlockID.au runs as an <strong>AI-augmented solo-founder</strong>{" "}
              organisation. One human founder (Aus Dvl,{" "}
              <code>admin@blockid.au</code>) plus {ADVISORS.length} specialised
              agent roles. Each agent runs its own research / build / report cron
              and reports to the CEO orchestrator. Full roster of truth:{" "}
              <code>web/content/team-roster.json</code>; org chart in{" "}
              <code>docs/TEAM_STRUCTURE.md</code>.
            </p>
            <div className="rounded-xl border border-surface-200 bg-surface-50 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-100 text-ink-700">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold w-20">
                      Role
                    </th>
                    <th className="text-left px-4 py-2 font-semibold">
                      Agent scope
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ADVISORS.map((a) => (
                    <tr
                      key={a.role}
                      className="border-t border-surface-200 align-top"
                    >
                      <td className="px-4 py-2 font-mono text-xs uppercase text-brand-600">
                        {a.role}
                      </td>
                      <td className="px-4 py-2 text-ink-700">
                        <span className="font-medium text-ink-800">
                          {a.name}
                        </span>{" "}
                        — {a.scope}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-500 mt-3">
              Headcount / salary / ESOP-grant flows in the CHRO agent describe{" "}
              <em>future</em> hires. Today the company ships via cron loops, not
              people. ESOP pool 12% reserved for first hires — see{" "}
              <code>docs/ESOP_DESIGN.md</code>.
            </p>
          </section>

          {/* Recently updated */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Recently updated docs
            </h2>
            <p className="text-sm text-ink-600 mb-6">
              Freshly-committed audits and plan deltas that reset the fleet
              context this cycle.
            </p>
            <ul className="space-y-3">
              {RECENTLY_UPDATED_DOCS.map((doc) => (
                <li
                  key={doc.slug}
                  className="rounded-xl border border-surface-200 bg-surface-50 p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
                    <p className="text-base font-semibold text-ink-800">
                      {doc.title}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-ink-500">
                      updated {doc.updated}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-600 mb-2">
                    {doc.summary}
                  </p>
                  <p className="text-[11px] font-mono text-ink-400 break-all">
                    {doc.slug}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* In-flight workflow docs */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Active workflow plans
            </h2>
            <p className="text-sm text-ink-600 mb-6">
              The plan files the autonomous loop reads on every tick.
            </p>
            <ul className="space-y-3">
              {WORKFLOW_DOCS.map((doc) => (
                <li
                  key={doc.slug}
                  className="rounded-xl border border-surface-200 bg-surface-50 p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
                    <p className="text-base font-semibold text-ink-800">
                      {doc.title}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-ink-500">
                      {doc.updated}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-600 mb-2">
                    {doc.summary}
                  </p>
                  <p className="text-[11px] font-mono text-ink-400 break-all">
                    {doc.slug}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* Canonical vocab */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Canonical journey vocabulary
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              The 8-stage journey ratified in the parity audit — Idea,
              Validation, MVP / Early Revenue, Seed, Series A, Series B/C,
              Late-stage, Public / Exit. Every surface (roadmap, guide,
              reports) is being migrated onto this vocabulary; four legacy
              taxonomies are being retired.
            </p>
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-5">
              <p className="text-xs uppercase tracking-wider text-ink-500 mb-2">
                Module reference
              </p>
              <p className="text-sm font-mono text-ink-700 break-all">
                web/src/lib/journey-vocabulary.ts (v
                {JOURNEY_VOCAB_VERSION})
              </p>
              <p className="text-xs text-ink-500 mt-2">
                Consumed by <code>/roadmap</code>, <code>/guide</code>,
                report renderers, and the SVI stage mapper via{" "}
                <code>sviStageToCanonical()</code>.
              </p>
            </div>
          </section>

          {/* Related surfaces */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">
              Related surfaces
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Link
                href="/team"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /team
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  17 AI-agent C-Levels and their most recent shipped
                  contribution.
                </p>
              </Link>
              <Link
                href="/roadmap"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /roadmap
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  The 8-stage platform roadmap with per-stage entry and exit
                  criteria.
                </p>
              </Link>
              <Link
                href="/developers"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /developers
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Developer platform, API endpoints, and integration reference.
                </p>
              </Link>
              <Link
                href="/changelog"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /changelog
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Human-readable release notes tied to the autonomous ship
                  cadence.
                </p>
              </Link>
              <Link
                href="/svi"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">/svi</p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Startup Value Index&trade; explainer, radar chart, and the
                  8-dimension scoring framework.
                </p>
              </Link>
              <Link
                href="/index"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">/index</p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Public AU startup index — live SVI leaderboard and
                  cohort-percentile view.
                </p>
              </Link>
              <Link
                href="/founding-50"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /founding-50
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Founding {foundingSpots} lifetime deal — {foundingPrice} for{" "}
                  {foundingCredits} SVI-analysis credits until {promoDeadline}.
                </p>
              </Link>
              <Link
                href="/startup-package"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /startup-package
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Ship-1 founder journey — guided interview, agent dispatch,
                  auto-fill deliverables, reserved cap-table.
                </p>
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
