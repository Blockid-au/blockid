import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, PageHero, Section } from "@/components/marketing/template";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Dot,
  Hourglass,
  Sparkles,
} from "lucide-react";
import {
  CANONICAL_STAGE_LABELS,
  CANONICAL_STAGES,
  JOURNEY_VOCAB_VERSION,
} from "@/lib/journey-vocabulary";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Platform roadmap — idea to exit",
  description: "The 8-stage journey from founder idea to exit — where we are now, and what ships next.",
  path: "/roadmap",
});

// ---------------------------------------------------------------------------
// Types + data
// ---------------------------------------------------------------------------

type VersionFile = {
  version?: string;
  updated_at?: string;
  git_sha?: string;
  release_id?: string;
  task_ids?: string[];
  notes?: string;
};

type Phase = {
  number: number;
  name: string;
  subtitle: string;
  blurb: string;
};

const PLATFORM_PHASES: Phase[] = [
  {
    number: 1,
    name: "Founder Vision",
    subtitle: "SVI baseline",
    blurb:
      "Submit the idea, get an 8-dimension Startup Viability Index score, evidence vault, and shareable link.",
  },
  {
    number: 2,
    name: "Valuation",
    subtitle: "Multi-method engine",
    blurb:
      "DCF, Berkus, Scorecard and comparables with AU market benchmarks and stage-adjusted confidence bands.",
  },
  {
    number: 3,
    name: "Equity Structure",
    subtitle: "Founder splits + vesting",
    blurb:
      "Founder splits, vesting terms, share classes and reverse-vesting scaffolds — export-ready for legal review.",
  },
  {
    number: 4,
    name: "ESOP",
    subtitle: "Employee option pool",
    blurb:
      "Pool sizing, grant tracking, vesting schedules, and s83A ATO election workflow for eligible early-stage grants.",
  },
  {
    number: 5,
    name: "Cap Table",
    subtitle: "Live register",
    blurb:
      "Real-time cap table with SAFE / convertible-note support, waterfall modelling, and diff-on-every-change history.",
  },
  {
    number: 6,
    name: "Tokenisation",
    subtitle: "Compliance-gated mirror",
    blurb:
      "Optional on-chain mirror of the cap table (wholesale-only under s708). Display-only until legal review passes.",
  },
  {
    number: 7,
    name: "Dividend",
    subtitle: "Distribution rails",
    blurb:
      "Distribution schedules, franking credits, and on-chain dividend rails for tokenised registers.",
  },
  {
    number: 8,
    name: "Exit",
    subtitle: "Data-room + secondary",
    blurb:
      "Data-room, secondary market intros, and acquisition / IPO checklist packs — audit-trail intact.",
  },
];

// Stage 6 (tokenisation) is the compliance-gated one: the live register
// (5), dividend statements / DRIP / FY tax statements (7, S28) and the
// exit-phase data room + listing readiness (8, S29) shipped 2026-09-13.
const CURRENT_PLATFORM_PHASE = 6;

// ---------------------------------------------------------------------------
// Snapshot as of 2026-09-19 — G11 → G17 closed (docs/plans/SOURCE-OF-TRUTH.md
// §1 + Appendix A, ROADMAP.md §1–§3). Refresh on each goal close: facts only
// (dates, counts, goal ids); no invented customer numbers.
// ---------------------------------------------------------------------------

const SNAPSHOT_DATE = "2026-09-19";

type ShippedItem = {
  id: string;
  title: string;
  detail: string;
  ticket?: string;
};

const RECENTLY_LANDED: ShippedItem[] = [
  {
    id: "g17-unicorn-homepage",
    title: "G17 — Unicorn homepage & one site template (shipped 2026-09-19)",
    detail:
      "Evaluator-first hero, 5-entry nav, no price tables on the home page, /product and /samples intro pages, template primitives on every marketing page and the /vi mirrors (docs/design/unicorn-template.md). A link checker now runs inside deploy gate 8 and daily: production 525 pages · 1,638 links · 0 broken.",
    ticket: "G17 · fc155500c → 5a0c3dbb1",
  },
  {
    id: "g16-first-dollar",
    title: "G16 — First dollar: funnel truth, A$3 paywall, evaluator pilots (shipped 2026-09-19)",
    detail:
      "Server-side funnel events (sign_up, svi_analyze, svi_score_computed, report_view, checkout, trust_report_purchased) and /admin/funnel on real data; the A$3 Trusted Business Report is reachable again through a locked-chapter preview and a quote-then-pay unlock; 30-day evaluator pilot comps (cap 5) with /pilot and an expiry cron. Migration 0411.",
    ticket: "G16 · 8cbb6bdb8 → 58406efa2",
  },
  {
    id: "g15-reliability",
    title: "G15 — Reliability: ship safety, observability, data safety (shipped 2026-09-18)",
    detail:
      "Deploy manifest truth and a gate that verifies the live bundle SHA, append-mode production log with rotation, error digest + latency SLO on /api/status v2 and /status, weekly restore drill (first run 12/12 tables ≥ 99.8 %), AI provider health snapshot, Telegram → e-mail alert fallback.",
    ticket: "G15 · 3ce353da8 → bac472af4",
  },
  {
    id: "g14-investor-feedback",
    title: "G14 — Investor feedback loop: deck v3, pricing v4, intake link, Evaluator API v1, backtest (shipped 2026-09-16 → 17)",
    detail:
      "Evaluator-first pitch deck v3, Fund / Intake link / Index API / Cohort 25 and 100 tiers with Stripe prices minted, weekly founder feedback letter (k ≥ 3 assessors from ≥ 2 orgs), program intake link /apply/[slug], verification integrity (confidence capped by evidence origin, L0–L5 ABN multiplier, /methodology), founder execution rubric, /api/v1/evaluations with Slack / Affinity / Airtable destinations, backtest v0 (N = 49, ρ 0.76 round / 0.94 valuation), ABR + R&DTI open signals. Migrations 0400–0410.",
    ticket: "G14 · 8 sprints",
  },
  {
    id: "g13-investor-clarity",
    title: "G13 — Investor clarity: nav v4, Trusted Business Report v2, Investor Dossier, taxonomy (shipped 2026-09-16)",
    detail:
      "Founder groups Home · Prove · Money · Company and evaluator Home · Deal flow · Reports with 10 personas and post-login landings; the report follows the 8 dimensions with a named C-Level owner each and 17 deterministic SVG visuals (/tbr/demo); Investor Dossier + versioned evaluator assessments; startup taxonomy (22 industries, 10 models, 8 canonical stages). 15 sprints and migrations 0390–0403 in one day.",
    ticket: "G13 · W1 → W5",
  },
  {
    id: "g11-g12-money-finder-evaluators",
    title: "G11 + G12 — Money Finder and the evaluator ladder (shipped 2026-09-10 → 11)",
    detail:
      "\"Do you need money?\" → free AU grant and program preview, ranked Money Finder report, Founder Radar bundled into Starter; Scout A$79 / Firm A$149 / Program A$349 evaluator plans with a card-required trial, the A$3 Trusted Business Report on any startup, Program batch scoring and the LP report; post-launch hardening S6–S15 and release readiness S24.",
    ticket: "G11 / G12 · S0 → S24",
  },
  {
    id: "context-aware-intake-v1",
    title: "Context-aware intake v1 — one door, three inputs (shipped 2026-09-08)",
    detail:
      "Unified /analyze route accepts a pitch deck (PDF / DOCX / PPTX + OCR), a website URL or a free-text idea in a single field; a classifier detects the input type, a depth-1 site crawler walks up to 8 same-host pages, and a stage-specific agent plan replaces the old fixed bundle. Cost preview reflects the plan before commit.",
    ticket: "v3.10.0 · shipped 2026-09-08",
  },
  {
    id: "journey-vocab",
    title: `Canonical 8-stage startup vocabulary v${JOURNEY_VOCAB_VERSION}`,
    detail:
      "web/src/lib/journey-vocabulary.ts replaces four overlapping legacy taxonomies (SVI-8, Growth-12, Startup Compass 5-dimension, roadmap-8); the G13 startup taxonomy and the 12 workspace growth phases map onto it.",
    ticket: "Vocab v1.0.0",
  },
];

type UpcomingItem = {
  id: string;
  title: string;
  detail: string;
  status: "in_progress" | "planned";
};

const IN_PROGRESS: UpcomingItem[] = [
  {
    id: "evaluator-traction",
    title: "Evaluator traction T1–T4 (founder-led GTM)",
    detail:
      "Angel groups → accelerator pilots on batch scoring → advisory firms via the reseller module → comparison pages and case studies. The product side (pilot comp, intake link, Evaluator API) is live; interviews, LOIs and pilot names are founder-led (docs/plans/g14-investor-feedback-2026-09-16/01-gtm-evaluators-90d.md).",
    status: "in_progress",
  },
  {
    id: "first-paid-tbr",
    title: "First paid Trusted Business Report (G16 30-day KPI)",
    detail:
      "The funnel now records every step server-side; /admin/funnel and the daily funnel report watch sign_up → svi_score_computed → report_view → checkout → trust_report_purchased after the G16 deploy.",
    status: "in_progress",
  },
  {
    id: "zapier-app",
    title: "Zapier app for the Evaluator API v1",
    detail:
      "Today a Zapier Catch Hook URL works as a generic webhook destination; a listed Zapier app with triggers for assessment.submitted and evaluation.report_ready is the deferred follow-up from G14-S38.",
    status: "planned",
  },
  {
    id: "g16-g17-deferred",
    title: "Deferred P2/P3 items from the G16 / G17 reviews",
    detail:
      "Per-address limiter and subject scrub on the pilot apply form, pilot ledger mutex / fsync, first off-peak ABR ingest, insights page peer counts, /vi/solutions/advisor description length, the orphan tier-ladder component. Tracked in the source of truth; none blocks a customer.",
    status: "planned",
  },
  {
    id: "playwright-headless-crawler-v2",
    title: "Playwright headless crawler v2 for /analyze",
    detail:
      "Upgrade the intake crawler from fetch + regex to a headless browser so SPA sites and JS-rendered pricing / team pages produce the same evidence quality as static sites. Depth stays capped at 1; per-host budget and robots.txt honoured.",
    status: "planned",
  },
  {
    id: "clamav",
    title: "ClamAV scan on evidence uploads",
    detail:
      "Scan every evidence upload before extraction; quarantine on hit; expose scan status alongside the verification level.",
    status: "planned",
  },
  {
    id: "vc-keypair",
    title: "VC issuer keypair custody",
    detail:
      "Hardware-backed signing for the verifiable credentials emitted from /id/[slug] and the partner API (runbook: docs/runbooks/vc-issuer-key-rotation.md).",
    status: "planned",
  },
];

type HumanBlockedItem = {
  id: string;
  title: string;
  detail: string;
  owner: string;
};

const HUMAN_BLOCKED: HumanBlockedItem[] = [
  {
    id: "telegram-token",
    title: "Ops alerts — new Telegram bot token",
    detail:
      "The old bot token was revoked (G15, 2026-09-18). Cron failures, backups, the uptime guardian and the error digest fall back to e-mail until a new TELEGRAM_BOT_TOKEN is minted and installed.",
    owner: "Human — founder",
  },
  {
    id: "offsite-backup-auth",
    title: "Off-site database backups — Google Drive quota auth",
    detail:
      "Nightly local backups and the weekly restore drill run; the off-site copy needs the founder to authorise the Drive quota once (scripts/db-backup-offsite-auth.mjs). A once-a-day alert fires until then.",
    owner: "Human — founder",
  },
  {
    id: "anthropic-key",
    title: "Anthropic API key for the report chain",
    detail:
      "Reports run DeepInfra-first with Gemini / Groq fallbacks and the Claude CLI as last resort; the Anthropic API rung shows blocked on /api/status until a valid key is installed.",
    owner: "Human — founder",
  },
  {
    id: "deck-loi-names",
    title: "Pilot / LOI names on the pitch deck",
    detail:
      "Deck v3 slide 9 carries placeholders until each named program or LOI signatory gives written consent (G14 F-9).",
    owner: "Human — founder + counsel",
  },
  {
    id: "infovision-abn-gst",
    title: "InfoVision reseller seed — ABN, GST status, signed agreement",
    detail:
      "The first reseller row cannot be seeded until a valid ABN and GST-registered flag are provided and the reseller deed (docs/legal/reseller-agreement-template.md) is executed.",
    owner: "Human — founder / counsel",
  },
  {
    id: "ga4-hero-variant",
    title: "GA4 hero_variant custom dimension",
    detail:
      "Hero one-liner A/B measurement needs the custom dimension created in the GA4 property (G11 T0250).",
    owner: "Human — GA4 admin",
  },
];

type QuarterPhase = {
  id: string;
  label: string;
  detail: string;
  status: "shipped" | "in_progress" | "planned";
};

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

// Module-scope cache. /roadmap is `force-dynamic`, so without this the file
// was re-parsed on every request. version.json only changes on deploy —
// mtime-check + 30s TTL keeps TTFB flat while still picking up new releases.
type VersionCache = { data: VersionFile | null; expiresAt: number; mtimeMs: number };
let versionCache: VersionCache | null = null;
const VERSION_CACHE_TTL_MS = 30_000;

function readVersion(): VersionFile | null {
  const now = Date.now();
  if (versionCache && versionCache.expiresAt > now) {
    return versionCache.data;
  }
  const candidates = [
    path.join(process.cwd(), "content", "reports", "version.json"),
    path.join(process.cwd(), "web", "content", "reports", "version.json"),
  ];
  for (const p of candidates) {
    try {
      const stat = fs.statSync(p);
      if (versionCache && versionCache.mtimeMs === stat.mtimeMs) {
        // File unchanged — extend TTL, skip re-parse.
        versionCache = {
          data: versionCache.data,
          expiresAt: now + VERSION_CACHE_TTL_MS,
          mtimeMs: stat.mtimeMs,
        };
        return versionCache.data;
      }
      const raw = fs.readFileSync(p, "utf-8");
      const data = JSON.parse(raw) as VersionFile;
      versionCache = {
        data,
        expiresAt: now + VERSION_CACHE_TTL_MS,
        mtimeMs: stat.mtimeMs,
      };
      return data;
    } catch {
      // try next candidate
    }
  }
  versionCache = { data: null, expiresAt: now + VERSION_CACHE_TTL_MS, mtimeMs: 0 };
  return null;
}

// Goal list for the current quarter (Q3 2026). Until G18 this keyed off a
// `v2.0.0-beta.N` regex on version.json, so every v3.x release rendered the
// five phases as "planned". Status now comes from the source of truth.
function quarterShipList(): QuarterPhase[] {
  return [
    {
      id: "g11-g12",
      label: "G11 + G12 — Money Finder + evaluator ladder",
      detail:
        "Grants and programs directory, Money Finder report, Founder Radar; Scout / Firm / Program plans, A$3 Trusted Business Report, batch scoring, LP report.",
      status: "shipped",
    },
    {
      id: "g13",
      label: "G13 — Investor clarity",
      detail:
        "Nav v4 + personas, Trusted Business Report v2, Investor Dossier, startup taxonomy.",
      status: "shipped",
    },
    {
      id: "g14",
      label: "G14 — Investor feedback loop",
      detail:
        "Deck v3, pricing v4, feedback letter, intake link, verification integrity, Evaluator API v1, backtest v0, open AU signals.",
      status: "shipped",
    },
    {
      id: "g15",
      label: "G15 — Reliability",
      detail:
        "Manifest truth + live-SHA gate, error digest + latency SLO, weekly restore drill, AI resilience.",
      status: "shipped",
    },
    {
      id: "g16-g17",
      label: "G16 + G17 — First dollar + unicorn homepage",
      detail:
        "Funnel events, A$3 unlock rail, evaluator pilots; evaluator-first home, one site template, link check in the deploy.",
      status: "shipped",
    },
    {
      id: "traction",
      label: "Evaluator traction T1–T4",
      detail:
        "First paying evaluators, intake links with submissions, pilots → paid. Founder-led; measured on /admin/funnel and the traction snapshot.",
      status: "in_progress",
    },
  ];
}

// ---------------------------------------------------------------------------
// Small view helpers
// ---------------------------------------------------------------------------

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function ShipIcon({ status }: { status: QuarterPhase["status"] }) {
  if (status === "shipped") {
    return (
      <CheckCircle2
        aria-label="Shipped"
        className="h-5 w-5 shrink-0 text-action"
      />
    );
  }
  if (status === "in_progress") {
    return (
      <Circle
        aria-label="In progress"
        className="h-5 w-5 shrink-0 text-svi-500"
      />
    );
  }
  return (
    <Dot
      aria-label="Planned"
      className="h-5 w-5 shrink-0 text-secondary"
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RoadmapPage() {
  const version = readVersion();
  const shipList = quarterShipList();
  const topTasks = (version?.task_ids ?? []).slice(0, 5);

  return (
    <MarketingShell>
      <PageViewTracker event="roadmap_viewed" params={{}} />

      <PageHero
        eyebrow="Roadmap"
        title="Where BlockID is going"
        sub="Eight stages, one workspace, one audit trail. SVI baseline to valuation, equity, ESOP, cap table, tokenisation, dividend and exit — all derived from data you can inspect and re-run. Below is what has shipped, what is building this quarter, and what is compliance-gated until legal review passes."
        align="start"
      />

      {/* Current milestone */}
      <Section id="milestone" tone="sunken" eyebrow="Current milestone" title="What just shipped">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          {version?.version ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1 text-xs font-semibold text-action">
              <Sparkles aria-hidden="true" className="h-3 w-3" />
              {version.version}
            </span>
          ) : null}
        </div>

        {version ? (
          <>
            <p className="mt-2 text-sm text-secondary">
              {version.release_id ? `${version.release_id} · ` : ""}
              Updated {formatDate(version.updated_at)}
              {version.git_sha ? ` · git ${version.git_sha}` : ""}
            </p>
            {topTasks.length > 0 ? (
              <ul className="mt-6 space-y-3">
                {topTasks.map((task, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-sm text-primary"
                  >
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-action"
                    />
                    <span>{task}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-secondary">
                No task IDs listed in this release manifest.
              </p>
            )}
            <div className="mt-6">
              <Link
                href="/changelog"
                className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-action transition-colors duration-200 ease-out hover:text-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Full changelog
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-secondary">
            Release manifest not yet published for this environment. The next
            deploy will populate this panel.
          </p>
        )}
      </Section>

      {/* Recently landed */}
      <Section id="landed"
        title="Recently landed"
        eyebrow={`Snapshot ${SNAPSHOT_DATE}`}
      >
        <p className="text-sm text-secondary">
          Goals G11 → G17 closed between 2026-09-10 and 2026-09-19. Sourced
          from
          <code className="mx-1 rounded bg-surface-raised px-1 py-0.5 text-xs">docs/plans/SOURCE-OF-TRUTH.md</code>
          and the git log on master; deploy SHAs are in the changelog.
        </p>
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {RECENTLY_LANDED.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-line-subtle bg-surface-raised p-4"
            >
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-action"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">
                  {item.title}
                  {item.ticket ? (
                    <span className="ml-2 text-[11px] font-medium uppercase tracking-wider text-secondary">
                      {item.ticket}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-secondary">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* Next up / In progress */}
      <Section id="next"
        tone="sunken"
        title="Next up"
        eyebrow="In flight"
      >
        <p className="text-sm text-secondary">
          What is open after G17, mirrored from the source of truth. Order
          reflects the earliest exit criterion still open; no engineering
          goal is in flight until the founder opens the next one.
        </p>
        <ul className="mt-6 space-y-3">
          {IN_PROGRESS.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-line-subtle bg-surface-raised p-4"
            >
              {item.status === "in_progress" ? (
                <Circle
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-svi-500"
                />
              ) : (
                <Clock
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-secondary"
                />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">
                  {item.title}
                  <span className="ml-2 text-[11px] font-medium uppercase tracking-wider text-secondary">
                    {item.status === "in_progress" ? "In progress" : "Planned"}
                  </span>
                </p>
                <p className="mt-1 text-sm text-secondary">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* Human-blocked / Waiting */}
      <Section id="gated"
        title="Human-blocked"
        eyebrow="Waiting on humans"
      >
        <p className="text-sm text-secondary">
          Work with runnable code that cannot ship until a human unblocks a
          real-world credential, contract, or provisioning step.
        </p>
        <ul className="mt-6 space-y-3">
          {HUMAN_BLOCKED.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-line-subtle bg-surface-raised p-4"
            >
              <Hourglass
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-svi-500"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">
                  {item.title}
                  <span className="ml-2 text-[11px] font-medium uppercase tracking-wider text-secondary">
                    {item.owner}
                  </span>
                </p>
                <p className="mt-1 text-sm text-secondary">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* The canonical 8-stage startup journey */}
      <Section id="journey"
        title="The 8-stage startup journey"
        eyebrow={`Canonical vocabulary v${JOURNEY_VOCAB_VERSION}`}
      >
        <p className="text-sm text-secondary">
          Every SVI report, dashboard, and data-room row now lines up with the
          same 8 stages a VC or accelerator would recognise — Idea, Validation,
          MVP / Early Revenue, Seed, Series A, Series B / C, Late-stage, and
          Public / Exit. Reference cases: Atlassian, Canva, Airwallex, Xero,
          Culture Amp.
        </p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CANONICAL_STAGES.map((key, idx) => (
            <li
              key={key}
              className="rounded-xl border border-line-subtle bg-surface-raised p-4"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-action">
                Stage {idx + 1}
              </span>
              <p className="mt-2 font-display text-base font-semibold text-primary">
                {CANONICAL_STAGE_LABELS[key].label_en}
              </p>
              <p className="mt-1 text-xs text-secondary">
                VI · {CANONICAL_STAGE_LABELS[key].label_vi}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      {/* The 8 platform phases */}
      <Section id="stages"
        title="The 8 platform stages"
        eyebrow="Journey"
      >
        <p className="text-secondary">
          Idea to exit in one register, one audit trail. Every stage feeds the
          next — the SVI evidence you upload on Day 0 flows through to your
          data-room on the day you sell.
        </p>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_PHASES.map((p) => {
            const inProgress = p.number === CURRENT_PLATFORM_PHASE;
            return (
              <li
                key={p.number}
                className="relative flex flex-col rounded-2xl border border-line-subtle bg-surface-sunken p-6"
              >
                {inProgress ? (
                  <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-line bg-surface-raised px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-action">
                    In progress
                  </span>
                ) : null}
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-action">
                  Stage {p.number}
                </span>
                <h3 className="mt-2 font-display text-lg font-semibold text-primary">
                  {p.name}
                </h3>
                <p className="mt-1 text-xs uppercase tracking-wider text-secondary">
                  {p.subtitle}
                </p>
                <p className="mt-3 text-sm text-secondary">
                  {p.blurb}
                </p>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* This quarter's ship list */}
      <Section id="quarter"
        tone="sunken"
        title="This quarter's ship list"
        eyebrow="Delivery"
      >
        <p className="text-sm text-secondary">
          The Q3 2026 goal sequence. Status mirrors the goal tables in the
          source of truth; the deployed build tag is shown above.
        </p>
        <ul className="mt-6 space-y-4">
          {shipList.map((phase) => (
            <li
              key={phase.id}
              className="flex items-start gap-3 rounded-xl border border-line-subtle bg-surface-raised p-4"
            >
              <ShipIcon status={phase.status} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">
                  {phase.label}
                  <span className="ml-2 text-[11px] font-medium uppercase tracking-wider text-secondary">
                    {phase.status === "shipped"
                      ? "Shipped"
                      : phase.status === "in_progress"
                        ? "In progress"
                        : "Planned"}
                  </span>
                </p>
                <p className="mt-1 text-sm text-secondary">
                  {phase.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand
        title="Follow every ship."
        sub="Every release is on the changelog; every control is on the security audit."
        primary={{ href: "/changelog", label: "Changelog", ctaId: "roadmap_final_changelog" }}
        secondary={{ href: "/security-audit", label: "Security audit" }}
      />
    </MarketingShell>
  );
}
