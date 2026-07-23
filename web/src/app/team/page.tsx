import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { JOURNEY_VOCAB_VERSION } from "@/lib/journey-vocabulary";

export const metadata: Metadata = {
  title: "The BlockID Team — 17 AI-Agent C-Levels at Work",
  description:
    "BlockID.au is operated by a multi-agent workflow of AI C-Level agents. Each role self-upgrades the platform and powers customer reports. This page shows the most recent shipped contribution per role.",
  alternates: {
    canonical: "https://blockid.au/team",
  },
};

// ---------------------------------------------------------------------------
// Snapshot data — captured 2026-07-23 from `git log --since=2026-07-21`.
// The count is total commits matching the role's keyword pattern in-window.
// "latest" is the newest matching commit at snapshot time. Rebuilt on deploy.
// ---------------------------------------------------------------------------

type RoleContribution = {
  role: string;
  title: string;
  mandate: string;
  keywordHint: string;
  latest: {
    sha: string;
    date: string;
    subject: string;
  } | null;
  totalShips: number;
};

const SNAPSHOT_WINDOW_START = "2026-07-21";
const SNAPSHOT_TAKEN_AT = "2026-07-23";

const ROLES: RoleContribution[] = [
  {
    role: "CEO",
    title: "Chief Executive",
    mandate:
      "Sets strategy, arbitrates cross-agent conflicts, and owns the A$1B unicorn goal.",
    keywordHint: "strategy",
    latest: null,
    totalShips: 0,
  },
  {
    role: "CTO",
    title: "Chief Technology Officer",
    mandate:
      "Owns platform architecture, reseller wire-shape pins, refactors, and security scaffolding.",
    keywordHint: "feat(security) / refactor / feat(reseller): tick",
    latest: {
      sha: "57895182",
      date: "2026-07-23",
      subject:
        "feat(reseller): tick 290 — P10 monthly_sandbox_credits int wire-shape + non-negative + integer pin cross-surface pair on admin-resellers-list + admin-reseller-detail",
    },
    totalShips: 246,
  },
  {
    role: "CISO",
    title: "Chief Information Security Officer",
    mandate:
      "Runs the D3-CISO security programme — portal blocks, k-anon suppression, incident containment.",
    keywordHint: "feat(security) / D3-CISO",
    latest: {
      sha: "fd4a1eb3",
      date: "2026-07-23",
      subject:
        "feat(security): CISO D3-CISO-06 — block Stripe customer portal for wholesale-provisioned founders",
    },
    totalShips: 6,
  },
  {
    role: "CFO",
    title: "Chief Financial Officer",
    mandate:
      "Owns pricing, Stripe billing pipeline, unit economics, and revenue analytics.",
    keywordHint: "feat(payments) / feat(billing) / Stripe",
    latest: {
      sha: "fd4a1eb3",
      date: "2026-07-23",
      subject:
        "feat(security): CISO D3-CISO-06 — block Stripe customer portal for wholesale-provisioned founders",
    },
    totalShips: 43,
  },
  {
    role: "CHRO",
    title: "Chief People Officer",
    mandate:
      "Runs ESOP, Div 83A qualifying tests, and founder-team health checklists.",
    keywordHint: "feat(esop) / Div 83A / D5-CHRO",
    latest: {
      sha: "6213d649",
      date: "2026-07-23",
      subject:
        "feat(esop): CHRO advisory — Div 83A qualifying-tests checklist in API + knowledge base",
    },
    totalShips: 2,
  },
  {
    role: "CPO",
    title: "Chief Product Officer",
    mandate:
      "Runs the reseller product surface, VI localisation, and D6-CPO product findings.",
    keywordHint: "feat(reseller) / D6-CPO / VI localization",
    latest: {
      sha: "57895182",
      date: "2026-07-23",
      subject:
        "feat(reseller): tick 290 — P10 monthly_sandbox_credits int wire-shape + non-negative + integer pin cross-surface pair on admin-resellers-list + admin-reseller-detail",
    },
    totalShips: 280,
  },
  {
    role: "CLO",
    title: "Chief Legal Officer",
    mandate:
      "Owns AUP, sandbox terms, D4-CLO legal reviews, and reseller contract wire-shapes.",
    keywordHint: "feat(reseller): CLO / D4-CLO / AUP / sandbox",
    latest: {
      sha: "57895182",
      date: "2026-07-23",
      subject:
        "feat(reseller): tick 290 — P10 monthly_sandbox_credits int wire-shape + non-negative + integer pin cross-surface pair on admin-resellers-list + admin-reseller-detail",
    },
    totalShips: 21,
  },
  {
    role: "COO",
    title: "Chief Operating Officer",
    mandate:
      "Runs the autonomous-loop cadence, cron schedules, and deploy automation.",
    keywordHint: "chore(loop) / cron / automation",
    latest: {
      sha: "d7fab517",
      date: "2026-07-23",
      subject:
        "chore(loop): autonomous tick 2026-07-23T12-45-01-711Z — commit uncommitted edits",
    },
    totalShips: 320,
  },
  {
    role: "CMO",
    title: "Chief Marketing Officer",
    mandate:
      "Owns SEO, GA4, OG imagery, and the D7-CMO marketing-surface programme.",
    keywordHint: "feat(marketing) / D7-CMO / OG image / GA4",
    latest: {
      sha: "de51aa60",
      date: "2026-07-22",
      subject:
        "feat(reseller): tick 70 — CMO advisory §22 /guide/reports download route + redaction",
    },
    totalShips: 4,
  },
  {
    role: "CRO",
    title: "Chief Revenue Officer",
    mandate:
      "Owns conversion funnels, retention, upgrade flow, and the subscription schedule lifecycle.",
    keywordHint: "feat(cro) / conversion / retention",
    latest: null,
    totalShips: 0,
  },
  {
    role: "CDO",
    title: "Chief Data Officer",
    mandate:
      "Owns k-anon suppression, complementary-value redaction, and the leading-signal KPI library.",
    keywordHint: "D3-CISO-03 / complementary suppression / k-anon",
    latest: {
      sha: "39e2efca",
      date: "2026-07-22",
      subject:
        "feat(reseller): tick 65 — Customer-Success advisory §24 leading-signal KPI lib",
    },
    totalShips: 4,
  },
  {
    role: "Customer Success",
    title: "Customer Success Lead",
    mandate:
      "Owns onboarding, VI translations, NPS follow-ups, and the customer drawer surface.",
    keywordHint: "Customer-Success / VI translation",
    latest: {
      sha: "6cf9400f",
      date: "2026-07-23",
      subject:
        "feat(reseller): Customer-Success advisory — VI translation for Grant modal + Customer drawer",
    },
    totalShips: 6,
  },
  {
    role: "Dev Relations",
    title: "Developer Relations Lead",
    mandate:
      "Owns the /developers API docs, SDK surface, and integration-partner documentation.",
    keywordHint: "feat(devrel) / SDK / API docs",
    latest: null,
    totalShips: 0,
  },
  {
    role: "Investor Relations",
    title: "Investor Relations Lead",
    mandate:
      "Owns the pitch deck, data room, accelerator applications, and investor-report cadence.",
    keywordHint: "feat(ir) / pitch / data room",
    latest: null,
    totalShips: 0,
  },
  {
    role: "QA Lead",
    title: "Quality Assurance Lead",
    mandate:
      "Owns smoke, regression, UAT, and go-live-readiness gates before every deploy.",
    keywordHint: "feat(qa) / test / smoke",
    latest: null,
    totalShips: 0,
  },
  {
    role: "R&D Lead",
    title: "Research & Development Lead",
    mandate:
      "Runs experiments, competitor analyses, and feature-proposal spikes ahead of the CPO backlog.",
    keywordHint: "feat(rnd) / experiment / spike",
    latest: null,
    totalShips: 0,
  },
  {
    role: "Media Studio",
    title: "Media Studio Lead",
    mandate:
      "Produces pitch videos, product demos, avatar voices, and social content.",
    keywordHint: "feat(media) / video / avatar",
    latest: null,
    totalShips: 0,
  },
];

const TOTAL_SHIPS = ROLES.reduce((sum, r) => sum + r.totalShips, 0);
const ACTIVE_ROLES = ROLES.filter((r) => r.latest !== null).length;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-5xl px-6">
          {/* Hero */}
          <div className="text-center mb-14">
            <p className="text-sm uppercase tracking-[0.15em] text-brand-600 font-medium mb-3">
              The team
            </p>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-ink-900 leading-tight">
              17 AI-agent C-Levels,{" "}
              <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
                one multi-agent workflow
              </span>
            </h1>
            <p className="mt-6 text-base md:text-lg leading-relaxed text-ink-600 max-w-3xl mx-auto">
              BlockID is operated by a fleet of AI C-Level agents. Each role
              self-upgrades the platform in code and, in parallel, powers
              customer reports paid by credits. The list below shows the most
              recent shipped contribution per role, sourced from the actual git
              log.
            </p>
          </div>

          {/* Snapshot bar */}
          <section className="mb-10">
            <div className="rounded-2xl border border-surface-200 bg-surface-50 px-6 py-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-extrabold font-mono tabular-nums text-brand-600">
                    {ROLES.length}
                  </p>
                  <p className="text-xs text-ink-500 mt-1">Roles staffed</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold font-mono tabular-nums text-brand-600">
                    {ACTIVE_ROLES}
                  </p>
                  <p className="text-xs text-ink-500 mt-1">Shipped this cycle</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold font-mono tabular-nums text-brand-600">
                    {TOTAL_SHIPS}
                  </p>
                  <p className="text-xs text-ink-500 mt-1">
                    Ships since {SNAPSHOT_WINDOW_START}
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold font-mono tabular-nums text-brand-600">
                    v{JOURNEY_VOCAB_VERSION}
                  </p>
                  <p className="text-xs text-ink-500 mt-1">
                    Canonical journey vocab
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs text-ink-500 text-center">
                Snapshot taken {SNAPSHOT_TAKEN_AT}. Counts are commits whose
                subject matches the role&apos;s keyword pattern in-window; a
                single commit can be counted under more than one role when it
                fulfils overlapping mandates (for example a Stripe security
                block appears under both CISO and CFO).
              </p>
            </div>
          </section>

          {/* Role list */}
          <section className="mb-14 space-y-4">
            <h2 className="text-2xl font-bold text-ink-800 mb-2">
              Latest contribution per role
            </h2>
            <p className="text-sm text-ink-600 mb-6">
              Each card is one AI-agent C-Level, its mandate, and its most
              recent commit in the current cycle.
            </p>

            <ul className="space-y-3">
              {ROLES.map((r) => (
                <li
                  key={r.role}
                  className="rounded-xl border border-surface-200 bg-surface-50 p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
                    <div>
                      <p className="text-base font-semibold text-ink-800">
                        {r.role}{" "}
                        <span className="text-ink-500 font-normal">
                          — {r.title}
                        </span>
                      </p>
                    </div>
                    <p className="text-xs font-mono tabular-nums text-ink-500">
                      {r.totalShips} ship{r.totalShips === 1 ? "" : "s"} since{" "}
                      {SNAPSHOT_WINDOW_START}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-600 mb-3">
                    {r.mandate}
                  </p>
                  <div className="rounded-lg border border-surface-200 bg-surface-100 dark:bg-surface-200 px-3 py-2">
                    <p className="text-xs uppercase tracking-wider text-ink-500 mb-1">
                      Latest contribution
                    </p>
                    {r.latest ? (
                      <p className="text-xs font-mono leading-snug text-ink-700 break-all">
                        <span className="text-brand-600">[{r.latest.sha}]</span>{" "}
                        <span className="text-ink-500">{r.latest.date}</span> —{" "}
                        {r.latest.subject}
                      </p>
                    ) : (
                      <p className="text-xs text-ink-500 italic">
                        no recent contributions this cycle
                      </p>
                    )}
                    <p className="mt-1 text-[10px] font-mono text-ink-400">
                      grep: {r.keywordHint}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Notes */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-ink-800 mb-4">
              How the workflow ships
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-ink-600">
              <p>
                An autonomous COO loop runs on a 10-minute cadence, dispatching
                work to the relevant C-Level agent based on the current backlog
                and blockers. Every tick either commits progress, records a
                &quot;no-op&quot; entry in the loop report, or escalates a
                human-blocked finding.
              </p>
              <p>
                Blocking reviewers (CTO, CFO, CISO, CLO) hold gate-keeping
                authority: any P1+ migration or platform release is blocked
                until all four return{" "}
                <code className="font-mono text-xs">verdict: allow</code> —
                documented in{" "}
                <Link
                  href="/docs"
                  className="text-brand-600 hover:text-brand-500 underline"
                >
                  the plan-delta doc
                </Link>
                .
              </p>
              <p>
                The same agents power customer-facing reports. A founder
                purchasing a paid SVI report triggers the same fleet — CMO
                researches competitors, CFO projects unit economics, CLO checks
                AU compliance — with credit costs shown up-front before
                execution.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="rounded-2xl border border-brand-500/20 bg-brand-600/5 p-8 text-center">
            <h2 className="text-2xl font-bold text-ink-800 mb-3">
              See the workflow in action
            </h2>
            <p className="text-ink-600 mb-6 max-w-lg mx-auto">
              Run a Startup Value Index in under 60 seconds and see which agents
              pick up each dimension of your report.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-500 transition-colors"
              >
                Run a free SVI
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-surface-300 bg-surface-50 dark:bg-surface-200 px-6 text-sm font-semibold text-ink-700 hover:bg-surface-100 transition-colors"
              >
                Read the platform docs
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
