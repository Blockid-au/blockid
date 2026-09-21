import type { Metadata } from "next";
import { LEGAL_ENTITY, LEGAL_ENTITY_ACN_LABEL } from "@/lib/site/legal-entity";
import { pageMetadata } from "@/lib/seo/page-meta";
import Link from "next/link";
import { NavV2 } from "@/components/landing/nav-v2";
import { Footer } from "@/components/marketing/footer";
import { JOURNEY_VOCAB_VERSION } from "@/lib/journey-vocabulary";
import { getPlatformConfig } from "@/lib/platform-config";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import { WEBHOOK_VERIFY_EXPRESS_EXAMPLE, WEBHOOK_VERIFY_SNIPPET } from "@/lib/webhooks/sign";

// S31-D: static + ISR. The credit-cost table reads platform-config (admin
// editable at /admin/config), so regenerate hourly rather than freezing it
// at build.
export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  title: "Platform docs — SVI, pricing, team, API, roadmap",
  description: "BlockID.au documentation — the Startup Value Index, pricing for founders and evaluators, a C-suite of AI agents, the Evaluator API v1, webhooks and what shipped.",
  path: "/docs",
});

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
    slug: "docs/plans/SOURCE-OF-TRUTH.md",
    title: "Source of truth — goals G1–G17, requirements register, human-blocked queue",
    updated: "2026-09-19",
    summary:
      "The one document every plan is merged into. §1 carries each goal's status (G11 Money Finder through G17 unicorn homepage all closed 2026-09-10 → 19), §5 the founder-only queue, Appendix A the deploy-by-deploy change log.",
  },
  {
    slug: "docs/design/unicorn-template.md",
    title: "Unicorn site template — the design contract for every marketing page",
    updated: "2026-09-19",
    summary:
      "Tokens, template primitives (PageHero / Section / CtaBand / Prose), the 5-entry nav, the evaluator-first hero and the rule that the home page carries no price tables. Every new marketing page and its /vi mirror must follow it.",
  },
  {
    slug: "docs/plans/first-dollar-2026-09-19.md",
    title: "G16 First dollar — funnel truth, A$3 paywall, evaluator pilots",
    updated: "2026-09-19",
    summary:
      "Why the first paid Trusted Business Report had been unreachable, the server-side funnel events that now exist, the quote-then-pay unlock rail and the 30-day evaluator pilot comp.",
  },
  {
    slug: "docs/plans/reliability-2026-09-18.md",
    title: "G15 Reliability — ship safety, observability, data safety, AI resilience",
    updated: "2026-09-18",
    summary:
      "Manifest truth and the live-bundle SHA gate, the append-mode production log, error digest and latency SLO, the weekly restore drill and the Telegram → e-mail alert fallback. Runbooks: docs/ops/deploy.md, docs/ops/slo.md, docs/runbooks/db-restore.md.",
  },
  {
    slug: "docs/API-REFERENCE.md",
    title: "API reference — session, cron, Evaluator API v1, partner and public endpoints",
    updated: "2026-09-19",
    summary:
      "Prose companion to /developers/api and /api/openapi.json: auth methods, the bk_live_ key scopes, the api.access plan gate, outbound webhook destinations and the credit costs.",
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
      "Trajectory: how the eight dimensions have moved over the last N snapshots.",
  },
];

// ---------------------------------------------------------------------------
// Roadmap highlights — condensed from docs/ROADMAP.md + web/CHANGELOG.md.
// Kept short here; the full living document lives in the repo.
// ---------------------------------------------------------------------------

type RoadmapItem = { title: string; note: string };

const SHIPPED_HIGHLIGHTS: RoadmapItem[] = [
  {
    title: "G17 — Unicorn homepage & one site template (2026-09-19)",
    note:
      "Evaluator-first hero, 5-entry nav, no prices on the home page, /product and /samples intro pages, template primitives on every marketing page and the /vi mirrors; a link checker runs inside deploy gate 8 and daily (production 525 pages · 1,638 links · 0 broken).",
  },
  {
    title: "G16 — First dollar (2026-09-19)",
    note:
      "Server-side funnel events and /admin/funnel on real data; the A$3 Trusted Business Report is reachable again through a locked-chapter preview and a quote-then-pay unlock; evaluator pilot comps (30 days, cap 5) with /pilot and an expiry cron.",
  },
  {
    title: "G15 — Reliability (2026-09-18)",
    note:
      "Deploy manifest truth and a live-bundle SHA gate, append-mode production log with rotation, error digest + latency SLO on /api/status v2 and /status, weekly restore drill, AI provider health snapshot, Telegram → e-mail alert fallback.",
  },
  {
    title: "G14 — Investor feedback loop (2026-09-16 → 17)",
    note:
      "Deck v3 (evaluator-first), pricing v4 (Fund / Intake link / Index API / Cohort 25 and 100), weekly founder feedback letter, program intake link /apply/[slug], verification integrity (confidence capped by evidence origin, L0–L5 ABN multiplier, /methodology), founder execution rubric, Evaluator API v1 with Slack / Affinity / Airtable destinations, backtest v0 (N = 49, ρ 0.76 round / 0.94 valuation), open AU signals (ABR, R&DTI).",
  },
  {
    title: "G13 — Investor clarity (2026-09-16)",
    note:
      "Nav v4 with 10 personas and post-login landings, Trusted Business Report v2 (8 dimensions each owned by a C-Level agent, 17 deterministic SVG visuals, /tbr/demo), Investor Dossier + evaluator assessments, startup taxonomy (22 industries, 10 models, 8 canonical stages); 15 sprints and migrations 0390–0403 in one day.",
  },
  {
    title: "G11 + G12 — Money Finder and the evaluator ladder (2026-09-10 → 11)",
    note:
      "\"Do you need money?\" → free AU grant and program preview, ranked Money Finder report, Founder Radar in Starter; Scout / Firm / Program evaluator plans with a card-required trial, the A$3 Trusted Business Report on any startup, Program batch scoring and the LP report; post-launch hardening (atomic credit spend, SSRF guard, CSRF gate, ESLint 271 → 0, SEO sweep of 163 pages).",
  },
  {
    title: "Earlier (2026-07 → 09-09)",
    note:
      "Startup Package (A$149 + 25 credits guided journey), reseller / wholesale module, AU compliance forms (GST, s708, ESIC, R&D), exit-readiness tile, context-aware /analyze intake (deck, website or idea), saved analyses, the investor data room, and the light-first design system. Full detail on /changelog.",
  },
];

const UPCOMING: RoadmapItem[] = [
  {
    title: "Evaluator traction T1–T4 (founder-led)",
    note:
      "Angel groups → accelerator pilots on batch scoring → advisory firms via the reseller module → comparison pages and case studies. Interviews, LOIs and pilot names are founder-led; the product side (pilot comp, intake link, API) is live.",
  },
  {
    title: "Deferred engineering backlog (tracked in the source of truth)",
    note:
      "Zapier app for the Evaluator API, per-address limiter on the pilot apply form, ledger mutex / fsync for pilots, first off-peak ABR ingest, insights page counts, the orphan tier-ladder component. None blocks a customer.",
  },
  {
    title: "Founder-only decisions",
    note:
      "New Telegram bot token for ops alerts, Google Drive quota auth for off-site backups, a valid Anthropic API key, written consent for pilot / LOI names on the deck, GA4 hero_variant dimension, InfoVision reseller ABN + agreement. Listed in docs/plans/SOURCE-OF-TRUTH.md §5.",
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
    slug: "docs/plans/SOURCE-OF-TRUTH.md",
    title: "Source of truth",
    updated: "living",
    summary:
      "Every goal, requirement and founder-blocked item is merged here; new plans amend it rather than living beside it. §6 has the sync-back rules.",
  },
  {
    slug: "ROADMAP.md",
    title: "Roadmap (repo root)",
    updated: "living",
    summary:
      "Goal tables G1–G17 with live / closed status and the §5 change-log header; the public /roadmap page is the condensed view.",
  },
  {
    slug: "docs/README.md",
    title: "Docs index",
    updated: "2026-09-19",
    summary:
      "Every document under docs/ with a one-line purpose and last-verified date; retired material lives in docs/archive/ with a header note.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DocsPage() {
  const cfg = await getPlatformConfig();
  // Prices come from the generated catalogue (plans.csv), not from
  // platform_config: `growth_price_monthly_cents` there still defaults to
  // the legacy 9900 (A$99), which is how this page said "reverts to A$99/mo"
  // for a week after Growth became A$69 (2026-09-08).
  const starterMonthly = `A$${GENERATED_PLANS_BY_ID.founder_starter.price_aud_cents / 100}/mo`;
  const growthMonthly = `A$${GENERATED_PLANS_BY_ID.founder_growth.price_aud_cents / 100}/mo`;
  // G18-A (2026-09-19): the evaluator line was typed by hand and omitted Fund.
  const evaluatorLadder = (["investor_angel", "investor_advisor", "investor_vc_small", "investor_fund"] as const)
    .map((id) => {
      const row = GENERATED_PLANS_BY_ID[id];
      return `${row.name} A$${(row.price_aud_cents / 100).toLocaleString("en-AU")}/mo`;
    })
    .join(" · ");
  const evaluatorTrialDays = GENERATED_PLANS_BY_ID.investor_angel.trial_days;
  const weights = cfg.svi_weights;

  return (
    <>
      <NavV2 />
      <main className="pt-8 pb-20">
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
              What the Startup Value Index is, what founders and evaluators pay,
              the AI C-Level team behind each dimension, the Evaluator API and
              webhooks, and what has shipped — plus the source-of-truth plans
              that keep the autonomous agent fleet on the same page.
            </p>
          </div>

          {/* Architecture — context-aware analysis pipeline (v3.10.0) */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Architecture — context-aware analysis pipeline (since v3.10.0)
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              Since v3.10.0 (2026-09-08) the platform accepts a founder&apos;s pitch deck
              (PDF / DOCX / PPTX + OCR fallback), a live website URL, or a
              free-text idea from a single input at{" "}
              <Link href="/analyze" className="text-brand-600 underline">
                /analyze
              </Link>
              . Everything is routed through one HTTP surface —{" "}
              <code>POST /api/intake</code> — which sits in front of the
              agent dispatcher.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-ink-700 mb-4">
              <li>
                <strong>Extract</strong> — deck parsers (PDF text layer, DOCX,
                PPTX) or website crawler (BFS depth 1, up to 8 same-host
                pages, prioritising <code>/about /pricing /team /product</code>)
                or free-text passthrough. PDFs without a text layer fall
                through to vision OCR (+2 credits, quoted before commit).
              </li>
              <li>
                <strong>Classify</strong> — a small classifier model tags the input as{" "}
                <code>pitch_deck</code>, <code>website</code>,{" "}
                <code>idea_text</code>, or <code>existing_company_text</code>{" "}
                with a confidence score.
              </li>
              <li>
                <strong>Detect context</strong> — composes existing detectors
                (<code>detectStage</code>, <code>detectMaturity</code>,{" "}
                <code>getCurrentPhase</code>) to place the startup on the
                8-stage journey and score evidence completeness.
              </li>
              <li>
                <strong>Plan agents</strong> — a stage-specific manifest picks
                the right C-Level agents (idea stage runs the lean 4-agent
                plan; later stages run the full plan across the 13-criteria
                rubric) instead of blindly firing every criterion.
              </li>
              <li>
                <strong>Quote &amp; run</strong> — the credit cost of the
                dynamic plan is shown before commit; the live UI (deck reader,
                site visitor, or idea lab) streams the agent output as it
                arrives.
              </li>
            </ol>
            <p className="text-xs text-ink-500">
              Source: <code>web/src/lib/intake/analyze-input.ts</code>,{" "}
              <code>web/src/lib/intake/detect-context.ts</code>,{" "}
              <code>web/src/app/api/intake/route.ts</code>. Legacy{" "}
              <code>/score</code> and <code>/one-click-report</code> funnels
              redirect to <code>/analyze</code>.
            </p>
          </section>

          {/* Outbound webhooks (S20-B) */}
          <section id="webhooks" className="mb-14 scroll-mt-28">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Outbound webhooks
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              Growth and Startup Package founders and every evaluator plan can
              register HTTPS endpoints at{" "}
              <Link href="/workspace/evidence/connectors#webhooks" className="text-brand-600 underline">
                /workspace/evidence/connectors
              </Link>
              . BlockID POSTs a JSON envelope{" "}
              <code>{"{ id, event, created_at, api_version, data }"}</code>{" "}
              for <code>svi.rescored</code>, <code>evidence.uploaded</code>,{" "}
              <code>funding.report_ready</code>, <code>evaluation.report_ready</code>{" "}
              and <code>assessment.submitted</code> (plus <code>ping</code> from
              the test button). Payloads carry ids and a small summary only —
              never emails, share tokens or report bodies.
            </p>
            <p className="text-sm text-ink-600 mb-4">
              Destination kinds (G14-S38): <code>generic</code> (HMAC-signed JSON
              to any public HTTPS URL — the default), <code>slack</code> (Block
              Kit to an incoming-webhook URL), <code>affinity</code> (notes and
              list entries) and <code>airtable</code> (records). Non-generic
              kinds are pinned to their vendor host and their credentials are
              sealed at rest and never echoed back. Zapier: use a Catch Hook
              URL as a generic destination. Management API:{" "}
              <code>GET|POST /api/webhooks</code>,{" "}
              <code>/api/webhooks/[id]</code>, <code>/test</code>,{" "}
              <code>/deliveries</code> — see{" "}
              <Link href="/developers/api" className="text-brand-600 underline">
                /developers/api
              </Link>
              .
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-ink-700 mb-4">
              <li>
                <code>X-BlockID-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>{" "}
                — HMAC-SHA256 of <code>{"`${t}.${rawBody}`"}</code> with the secret shown
                once when the endpoint was created. Reject timestamps older than 5 minutes.
              </li>
              <li>
                <code>X-BlockID-Event</code> — the event name; <code>X-BlockID-Delivery</code>{" "}
                — idempotency key, stable across retries. Answer 2xx within 8 s.
              </li>
              <li>
                Retries at 1 min, 10 min, 1 h and 6 h, then the delivery is marked dead.
                Twenty consecutive failures pause the endpoint (you get an in-app
                notification). Redirects are not followed; private / internal hosts are refused.
              </li>
            </ul>
            <pre className="rounded-xl border border-surface-200 bg-surface-50 p-4 text-xs leading-relaxed overflow-x-auto text-ink-800">
{/* S20-B review P2-5: rendered from the same string sign.test.ts executes, so the docs cannot drift from verifySignature. */}
{`${WEBHOOK_VERIFY_SNIPPET}

${WEBHOOK_VERIFY_EXPRESS_EXAMPLE}`}
            </pre>
            <p className="text-xs text-ink-500 mt-3">
              Source: <code>web/src/lib/webhooks/sign.ts</code> (signing + verification),{" "}
              <code>web/src/lib/webhooks/dispatch.ts</code> (retry ladder, SSRF guard),{" "}
              <code>web/src/app/api/webhooks/*</code> (management API).
            </p>
          </section>

          {/* Company / product overview */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              What BlockID.au is
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              BlockID.au is the platform behind the <strong>Startup Value Index
              (SVI)</strong> — an evidence-linked score for Australian startups
              that investors, accelerators and advisors use to compare deals, and
              that founders use to see where they stand. Evaluators pay for the
              workspace, the reports and the API; founders score for free and
              can unlock the full Trusted Business Report for A$3. The founder
              journey — Idea → Validation → MVP / Early Revenue → Seed → Series A
              → Series B/C → Late-stage → Public / Exit — is the same 8-stage
              vocabulary every report, dashboard and data-room row uses. Every
              output (report chapter, data room, cap-table reservation, investor
              pack, compliance form) is generated by a specialised AI C-Level
              agent and priced in credits.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-sm font-semibold text-ink-800 mb-1">Mission</p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Give evaluators one comparable, evidence-linked score for every
                  Australian startup — and give every founder the benchmarking and
                  compliance rigour that used to be reserved for VC-backed teams.
                </p>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  Operating model
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  One human founder plus an autonomous fleet of AI C-Level agents.
                  Cron loops research, build, ship and self-report; every deploy
                  runs the 12-gate <code>deploy-live.sh</code> pipeline on bare
                  metal (no Docker, no hosted CI), and ops alerts go to Telegram
                  with an e-mail fallback. Marketing entity {LEGAL_ENTITY.marketingOperator};
                  billing and legal entity {LEGAL_ENTITY.operator} ({LEGAL_ENTITY_ACN_LABEL}).
                </p>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  Positioning
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  <strong>Startup Value Index … by BlockID</strong> — the lead brand.
                  An 8-dimension score (scored on a 13-criteria internal rubric)
                  used by investors, accelerators and advisors to compare AU
                  startups apples-to-apples; calibrated against AU comparables
                  (backtest v0: ρ 0.76 on round size, 0.94 on valuation, N = 49 —
                  see <Link href="/methodology/calibration" className="text-brand-600 underline">/methodology/calibration</Link>).
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
              startup profile is graded on 8 weighted dimensions (each dimension
              is scored from a 13-criteria internal rubric and owned by one
              C-Level agent); weights are live-editable via{" "}
              <code>/admin/config</code> and default to the values below. See{" "}
              <Link href="/analyze" className="text-brand-600 underline">/analyze</Link>{" "}
              for the full explainer,{" "}
              <Link href="/methodology" className="text-brand-600 underline">/methodology</Link>{" "}
              for how evidence confidence and ABN verification cap a score, and{" "}
              <Link href="/startup-index" className="text-brand-600 underline">/startup-index</Link>{" "}
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

          {/* Progressive unlock — G8-P8 founder-facing matrix */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              What unlocks when
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              The workspace sidebar grows with the startup: groups appear as the
              founder reaches each of the 12 growth phases, and rows above the
              current plan stay visible but dimmed. The full phase × plan matrix
              and the evidence that clears each phase gate are published at{" "}
              <Link href="/docs/unlocks" className="text-brand-600 underline">
                /docs/unlocks
              </Link>{" "}
              — generated from the nav catalogue and gate engine, so it cannot
              drift from the app. Gates are advisory: founders can move on
              manually; the badge and investor-facing trust score follow the
              evidence.
            </p>
          </section>

          {/* Pricing ladder — founder prices come from the generated
              catalogue (plans.csv); evaluator rungs are the G12 D2 decision
              (2026-09-10) plus the G14 pricing v4 tiers (2026-09-16, Stripe
              prices minted 2026-09-17). Figures are owned by
              docs/ops/pricing-truth.md — change them there first. */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Pricing ladder
            </h2>
            <p className="text-sm text-ink-600 mb-4">
              One report price for everyone — <strong>A$3</strong> buys the full
              Trusted Business Report (8 dimensions, AUD valuation range,
              C-suite review, auditor flags, next-step plan) on any startup,
              whether you are its founder or someone evaluating it.
              Subscriptions sell the workspace that keeps the score, not
              access to the report.
            </p>
            <div className="rounded-xl border border-brand-500/40 bg-surface-50 p-5">
              <p className="text-sm text-ink-700 mb-2">
                <strong>Founders</strong>
              </p>
              <ul className="text-sm text-ink-600 space-y-1 list-disc list-inside mb-4">
                <li>Free — first SVI analysis, no signup</li>
                <li>A$3 — full Trusted Business Report</li>
                <li>{starterMonthly} — Starter: workspace, data room, investor links, Founder Radar</li>
                <li>{growthMonthly} — Growth: cap table, term sheets, evidence vault, weekly snapshots</li>
              </ul>
              <p className="text-sm text-ink-700 mb-2">
                <strong>Evaluators</strong> (investors, advisory firms,
                accelerators, incubators, service providers)
              </p>
              <ul className="text-sm text-ink-600 space-y-1 list-disc list-inside">
                <li>A$3 per Trusted Business Report on any startup you enter, pay as you go</li>
                <li>{evaluatorLadder} — reports included, tracked startups, seats, white-label</li>
                <li>Fund A$999/mo (investor firms, API access) · Intake link A$249/mo (program intake at /apply/[slug]) · Index API A$299/mo</li>
                <li>Accelerator cohorts: Cohort 25 A$5K/yr · Cohort 100 A$15K/yr (batch scoring + LP report)</li>
                <li>{evaluatorTrialDays}-day free trial on Scout / Firm / Program / Fund, card required; nothing billed if cancelled before day {evaluatorTrialDays + 1}</li>
                <li>Programs start a Cohort plan directly — 14-day trial, card required — at <Link href="/solutions/accelerator" className="text-brand-600 underline">/solutions/accelerator</Link> (the G16 / G21 pilots were retired 2026-09-21, G25)</li>
                <li>Reseller / wholesale: Contact Sales (all payments run through the single BlockID Stripe account; prices are GST-inclusive)</li>
              </ul>
              <p className="text-xs text-ink-500 mt-3">
                See <Link href="/pricing" className="text-brand-600 underline">/pricing</Link> for
                what each rung includes. Earlier promotions (the Founding 100
                lifetime deal, closed 2026-09-01) are honoured for their buyers
                on a legacy plan and are not sold.
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
                  <p className="text-[11px] font-mono text-ink-600 break-all">
                    {doc.slug}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* In-flight workflow docs */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Plans and indexes
            </h2>
            <p className="text-sm text-ink-600 mb-6">
              Where a change is recorded first. Goal loops were retired in
              2026-08; work now runs as founder-led sessions plus the CEO
              implementing-plan cron, both recorded in the source of truth.
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
                  <p className="text-[11px] font-mono text-ink-600 break-all">
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
              reports, the G13 startup taxonomy) uses this vocabulary; the
              12 growth phases of the workspace map onto it.
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
                  The C-suite of AI agents and their most recent shipped
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
                href="/analyze"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">/svi</p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Startup Value Index&trade; explainer, radar chart, and the
                  8-dimension scoring framework.
                </p>
              </Link>
              <Link
                href="/startup-index"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">/startup-index</p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Public AU startup index — live SVI leaderboard and
                  cohort-percentile view.
                </p>
              </Link>
              <Link
                href="/developers/api"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /developers/api
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Public endpoints, the Evaluator API v1 (Bearer bk_live_ keys,
                  scopes, the api.access plan gate) and openapi.json.
                </p>
              </Link>
              <Link
                href="/methodology"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">
                  /methodology
                </p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Evidence confidence, the ABN verification ladder and the
                  published backtest.
                </p>
              </Link>
              <Link
                href="/status"
                className="rounded-xl border border-surface-200 bg-surface-50 p-4 hover:border-brand-500/40 transition-colors"
              >
                <p className="text-sm font-semibold text-ink-800 mb-1">/status</p>
                <p className="text-xs text-ink-600 leading-relaxed">
                  Live version, uptime, last deploy and gate count, error and
                  latency sections.
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
