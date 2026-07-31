import type { Metadata } from "next";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";
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

export const metadata: Metadata = {
  title: "Platform Roadmap — BlockID.au",
  description:
    "The 8-stage journey from founder idea to exit — where we are now, and what ships next.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://blockid.au/roadmap" },
};

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

const CURRENT_PLATFORM_PHASE = 5;

// ---------------------------------------------------------------------------
// Snapshot as of 2026-07-31 — v3.0 Master Upgrade landing.
// Source: /home/dovanlong/.claude/plans/h-y-k-t-h-p-n-ng-hazy-sutton.md,
// docs/plans/plan-delta-2026-07-23.md, and recent git log. Refresh on each
// roadmap sync tick.
// ---------------------------------------------------------------------------

const SNAPSHOT_DATE = "2026-07-31";

type ShippedItem = {
  id: string;
  title: string;
  detail: string;
  ticket?: string;
};

const RECENTLY_LANDED: ShippedItem[] = [
  {
    id: "v3-hero-paywall",
    title: "Phase 1 — HeroV3 + SSO-aware CTA + report paywall",
    detail:
      "Locked v3 messaging ('One Business. One Trusted Identity.') behind NEXT_PUBLIC_UPGRADE_V3, SSO-aware CTA via cookie hint, and a 9-state report_orders lifecycle (0270) with A$5.50 inc-GST checkout (Path A) or 200-credit redemption (Path B) behind ReportPaywallGate.",
    ticket: "Phase 1",
  },
  {
    id: "v3-backbone",
    title: "Stage 3 — Report backbone + solution pages + nav v3",
    detail:
      "Stripe webhook branch for report_order scope with reconciliation INSERT fallback, migration 0272_report_generation_queue + worker + 2-min drain cron, 4 solution pages (/solutions/{founder,vn-sme,investor,accelerator}) + /business-id explainer, sitemap + robots + /for/* → /solutions/* 301 redirects, PersonaRail (6) + JourneySidebar (8) + TierGate + UpgradeChip.",
    ticket: "Stage 3",
  },
  {
    id: "v3-business-id",
    title: "Stage 4 — /id/[slug] Verified Business Identity surface",
    detail:
      "Public SEO-indexable /id/[slug] profile (migration 0273) with PII whitelist, JSON-LD, /embed/badge SVG widget for external sites, sitemap entries + 5 new solution/business-id URLs.",
    ticket: "Stage 4 · D3",
  },
  {
    id: "v3-consent",
    title: "Stage 4 — Consent-based sharing + revocation",
    detail:
      "0250_consents + consent_state_events + 0251_share_packages + 0252_revocations (BCR-004) with enforceConsent middleware on read paths.",
    ticket: "BCR-004",
  },
  {
    id: "v3-verification-ladder",
    title: "Phase 2 — 5-level verification ladder + ABR adapter",
    detail:
      "0202_business_profile VIEW, ABR adapter with JSONP + Zod normalisation, POST /api/verification/abr endpoint, and a verification-level engine deriving Basic → Standard → Enhanced → Verified → Trusted from evidence + provenance.",
    ticket: "Phase 2 · F1-F3",
  },
  {
    id: "v3-evidence",
    title: "Phase 3 — Evidence pipeline with versioning + extraction",
    detail:
      "0210_evidence + 0211_evidence_versions + 0212_evidence_extractions, SHA-256 hash-verify, and a state-machine (pending → verified / rejected) covering upload, extraction, and version churn.",
    ticket: "Phase 3 · G1-G3",
  },
  {
    id: "v3-ai-orchestration",
    title: "Phase 4 — AI orchestration: prompt registry + Zod contracts",
    detail:
      "0230_prompt_versions + 0231_ai_runs, canonical Zod output contracts, canary→prod prompt swap, callStructured wrapper for typed LLM outputs — foundation for the 12-area analysis engine.",
    ticket: "Phase 4 · H1-H3",
  },
  {
    id: "v3-programme",
    title: "Phase 5 — Programme + marketplace + partner API",
    detail:
      "0290_programme_cohorts + 0291_marketplace_opportunities + 0292_oauth2_partners, verifyPartnerBearer, and GET /api/v1/id/[slug] partner-callable JSON.",
    ticket: "Phase 5 · I1-I4",
  },
  {
    id: "v3-unicorn",
    title: "Phase 6 — Unicorn framework S0-S5",
    detail:
      "0280_unicorn_stages + framework.ts + goals.ts decomposition + <UnicornPathDashboard/> server component + 2 nightly crons projecting founder progress against the S0→S5 unicorn ladder.",
    ticket: "Phase 6 · J1-J3",
  },
  {
    id: "journey-vocab",
    title: `Canonical 8-stage startup vocabulary v${JOURNEY_VOCAB_VERSION}`,
    detail:
      "web/src/lib/journey-vocabulary.ts replaces four overlapping legacy taxonomies (SVI-8, Growth-12, Startup Compass 5-dimension, roadmap-8). Legacy surfaces still migrating.",
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
    id: "reseller-promo",
    title: "Reseller promotion codes (Agent K) — IFV / DVL prefixes",
    detail:
      "K1-K3 landed (reseller_promotion_codes schema, IFV+DVL seed script, resolvePromoCode runtime helper + 8-case test). Next: wire into checkout attribution ledger.",
    status: "in_progress",
  },
  {
    id: "reseller-roster",
    title: "Reseller startup roster (Agent L)",
    detail:
      "L1 view (0295 reseller_startup_roster) + L2 readResellerRoster helper landed. L3 pending: /reseller/roster page + 0296 notes/activity table.",
    status: "in_progress",
  },
  {
    id: "reseller-attribution",
    title: "?ref=CODE attribution wiring (Agent M)",
    detail:
      "M1 (?ref= deep-link capture + first-touch cookie) + M2 (signup promo-code input + POST /api/reseller/validate-promo) landed. M3 pending: Stripe checkout attribution + reconciliation ledger.",
    status: "in_progress",
  },
  {
    id: "supabase-ssr",
    title: "Full @supabase/ssr middleware refresh (§8.9 stage 2)",
    detail:
      "Migrate remaining server surfaces from legacy auth-helpers to @supabase/ssr with the standard cookie handshake.",
    status: "planned",
  },
  {
    id: "route-groups",
    title: "Route groups reorganisation",
    detail:
      "Physical (marketing)/(app)/(persona)/* split under app/ to isolate marketing shells, authed workspace, and persona rails.",
    status: "planned",
  },
  {
    id: "clamav",
    title: "ClamAV daemon integration for evidence malware scan",
    detail:
      "Scan every evidence upload before extraction; quarantine on hit; expose scan-status alongside verification level.",
    status: "planned",
  },
  {
    id: "prompt-fixtures",
    title: "Prompt-eval golden fixtures",
    detail:
      "Pin canonical inputs → expected structured outputs per prompt version so canary→prod swap is diff-reviewable.",
    status: "planned",
  },
  {
    id: "vi-mirror",
    title: "Full /vi/* mirror",
    detail:
      "Beyond the Phase 1 MVP surfaces — mirror /solutions, /id, /pricing, /docs into /vi.",
    status: "planned",
  },
  {
    id: "vc-keypair",
    title: "VC issuer keypair custody",
    detail:
      "Hardware-backed signing for verifiable credentials emitted from /id/[slug] and partner API.",
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
    id: "grandfather-a149",
    title: "Migration 0271_grandfather_a149 — pricing carry-over",
    detail:
      "Grandfather the A$149 startup-package cohort under v3 SKUs. Blocked on CFO sign-off for the pricing carry-over rules and Stripe reconciliation strategy.",
    owner: "Human — CFO",
  },
  {
    id: "stripe-sync-plans",
    title: "scripts/stripe/sync-plans.mjs — live provisioning",
    detail:
      "Live Stripe price + product provisioning for v3 SKU catalogue (sku_trust_report_5aud + 6 tier SKUs). Blocked on CFO Stripe key + billing-code provisioning.",
    owner: "Human — CFO",
  },
  {
    id: "infovision-abn-gst",
    title: "InfoVision reseller seed — ABN + GST registration",
    detail:
      "resellers row for InfoVision can't be seeded until a valid ABN and GST-registered flag are provided. Reseller agreement (D4-CLO-02) also awaits execution.",
    owner: "Human — CFO / CLO",
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

function quarterShipList(version: VersionFile | null): QuarterPhase[] {
  const v = version?.version ?? "";
  const beta = /v2\.0\.0-beta\.(\d+)/.exec(v);
  const betaN = beta ? Number(beta[1]) : 0;
  const atLeastBeta = /^v2\.0\.0-beta/.test(v) || /^v2\.[1-9]/.test(v);

  return [
    {
      id: "phase0",
      label: "Phase 0 — Kickoff",
      detail:
        "Feature-flag matrix, seeded Stripe products, sprint board, voice/tone guide.",
      status: atLeastBeta ? "shipped" : "in_progress",
    },
    {
      id: "phase1",
      label: "Phase 1 — Foundation",
      detail:
        "Migrations 0073-0077, plan engine, entitlement checks, GST module.",
      status: atLeastBeta ? "shipped" : "planned",
    },
    {
      id: "phase2",
      label: "Phase 2 — Segment surfaces",
      detail:
        "Homepage v2, pricing matrix, onboarding wizard, 7-day Stripe SetupIntent trial.",
      status: atLeastBeta ? "shipped" : "planned",
    },
    {
      id: "phase3",
      label: "Phase 3 — Analytics + Workspaces",
      detail:
        "GA4 catalog, conversion triggers, lifecycle email drip, Investor / Advisor / Accelerator workspaces.",
      status: betaN >= 4 ? "shipped" : "in_progress",
    },
    {
      id: "phase4",
      label: "Phase 4 — Compliance, QA, Deploy",
      detail:
        "Disclaimer registry hash-chain, ACL / APP consent, k6 load, Playwright regression, release gate.",
      status: betaN >= 5 ? "in_progress" : "planned",
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
        className="h-5 w-5 shrink-0 text-[var(--fintech-accent)]"
      />
    );
  }
  if (status === "in_progress") {
    return (
      <Circle
        aria-label="In progress"
        className="h-5 w-5 shrink-0 text-[var(--fintech-accent-hot)]"
      />
    );
  }
  return (
    <Dot
      aria-label="Planned"
      className="h-5 w-5 shrink-0 text-[var(--fintech-ink-muted)]"
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RoadmapPage() {
  const version = readVersion();
  const shipList = quarterShipList(version);
  const topTasks = (version?.task_ids ?? []).slice(0, 5);

  return (
    <MarketingShell>
      <PageViewTracker event="roadmap_viewed" params={{}} />

      <MarketingHero
        eyebrow="Roadmap"
        title="Where BlockID is going"
        subtitle="Eight stages, one workspace, one audit trail. SVI baseline to valuation, equity, ESOP, cap table, tokenisation, dividend and exit — all derived from data you can inspect and re-run. Below is what has shipped, what is building this quarter, and what is compliance-gated until legal review passes."
      />

      {/* Current milestone */}
      <MarketingSection tone="elevated" kicker="Current milestone" title="What just shipped">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          {version?.version ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--fintech-border-strong)] bg-[var(--fintech-surface)] px-3 py-1 text-xs font-semibold text-[var(--fintech-accent)]">
              <Sparkles aria-hidden="true" className="h-3 w-3" />
              {version.version}
            </span>
          ) : null}
        </div>

        {version ? (
          <>
            <p className="mt-2 text-sm text-[var(--fintech-ink-muted)]">
              {version.release_id ? `${version.release_id} · ` : ""}
              Updated {formatDate(version.updated_at)}
              {version.git_sha ? ` · git ${version.git_sha}` : ""}
            </p>
            {topTasks.length > 0 ? (
              <ul className="mt-6 space-y-3">
                {topTasks.map((task, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-sm text-[var(--fintech-ink)]"
                  >
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--fintech-accent)]"
                    />
                    <span>{task}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[var(--fintech-ink-muted)]">
                No task IDs listed in this release manifest.
              </p>
            )}
            <div className="mt-6">
              <Link
                href="/changelog"
                className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-[var(--fintech-accent)] transition-colors duration-200 ease-out hover:text-[var(--fintech-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
              >
                Full changelog
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-[var(--fintech-ink-muted)]">
            Release manifest not yet published for this environment. The next
            deploy will populate this panel.
          </p>
        )}
      </MarketingSection>

      {/* Recently landed */}
      <MarketingSection
        title="Recently landed"
        kicker={`Snapshot ${SNAPSHOT_DATE}`}
      >
        <p className="text-sm text-[var(--fintech-ink-muted)]">
          v3.0 Master Upgrade — Phase 1-6 core landed 2026-07-30 → 2026-07-31.
          Sourced from
          <code className="mx-1 rounded bg-[var(--fintech-surface)] px-1 py-0.5 text-xs">~/.claude/plans/h-y-k-t-h-p-n-ng-hazy-sutton.md</code>
          and the git log on master.
        </p>
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {RECENTLY_LANDED.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-4"
            >
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--fintech-accent)]"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--fintech-ink)]">
                  {item.title}
                  {item.ticket ? (
                    <span className="ml-2 text-[11px] font-medium uppercase tracking-wider text-[var(--fintech-ink-muted)]">
                      {item.ticket}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-[var(--fintech-ink-muted)]">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </MarketingSection>

      {/* Next up / In progress */}
      <MarketingSection
        tone="elevated"
        title="Next up"
        kicker="In flight"
      >
        <p className="text-sm text-[var(--fintech-ink-muted)]">
          Top active goals mirrored from the plan-delta and reseller module
          plan. Order reflects the earliest exit-criterion still open.
        </p>
        <ul className="mt-6 space-y-3">
          {IN_PROGRESS.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-4"
            >
              {item.status === "in_progress" ? (
                <Circle
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--fintech-accent-hot)]"
                />
              ) : (
                <Clock
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--fintech-ink-muted)]"
                />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--fintech-ink)]">
                  {item.title}
                  <span className="ml-2 text-[11px] font-medium uppercase tracking-wider text-[var(--fintech-ink-muted)]">
                    {item.status === "in_progress" ? "In progress" : "Planned"}
                  </span>
                </p>
                <p className="mt-1 text-sm text-[var(--fintech-ink-muted)]">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </MarketingSection>

      {/* Human-blocked / Waiting */}
      <MarketingSection
        title="Human-blocked"
        kicker="Waiting on humans"
      >
        <p className="text-sm text-[var(--fintech-ink-muted)]">
          Work with runnable code that cannot ship until a human unblocks a
          real-world credential, contract, or provisioning step.
        </p>
        <ul className="mt-6 space-y-3">
          {HUMAN_BLOCKED.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-4"
            >
              <Hourglass
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--fintech-accent-hot)]"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--fintech-ink)]">
                  {item.title}
                  <span className="ml-2 text-[11px] font-medium uppercase tracking-wider text-[var(--fintech-ink-muted)]">
                    {item.owner}
                  </span>
                </p>
                <p className="mt-1 text-sm text-[var(--fintech-ink-muted)]">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </MarketingSection>

      {/* The canonical 8-stage startup journey */}
      <MarketingSection
        title="The 8-stage startup journey"
        kicker={`Canonical vocabulary v${JOURNEY_VOCAB_VERSION}`}
      >
        <p className="text-sm text-[var(--fintech-ink-muted)]">
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
              className="rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-4"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--fintech-accent)]">
                Stage {idx + 1}
              </span>
              <p className="mt-2 font-display text-base font-semibold text-[var(--fintech-ink)]">
                {CANONICAL_STAGE_LABELS[key].label_en}
              </p>
              <p className="mt-1 text-xs text-[var(--fintech-ink-muted)]">
                VI · {CANONICAL_STAGE_LABELS[key].label_vi}
              </p>
            </li>
          ))}
        </ol>
      </MarketingSection>

      {/* The 8 platform phases */}
      <MarketingSection
        title="The 8 platform stages"
        kicker="Journey"
      >
        <p className="text-[var(--fintech-ink-muted)]">
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
                className="relative flex flex-col rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6"
              >
                {inProgress ? (
                  <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-[var(--fintech-border-strong)] bg-[var(--fintech-surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--fintech-accent)]">
                    In progress
                  </span>
                ) : null}
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--fintech-accent)]">
                  Stage {p.number}
                </span>
                <h3 className="mt-2 font-display text-lg font-semibold text-[var(--fintech-ink)]">
                  {p.name}
                </h3>
                <p className="mt-1 text-xs uppercase tracking-wider text-[var(--fintech-ink-muted)]">
                  {p.subtitle}
                </p>
                <p className="mt-3 text-sm text-[var(--fintech-ink-muted)]">
                  {p.blurb}
                </p>
              </li>
            );
          })}
        </ol>
      </MarketingSection>

      {/* This quarter's ship list */}
      <MarketingSection
        tone="elevated"
        title="This quarter's ship list"
        kicker="Delivery"
      >
        <p className="text-sm text-[var(--fintech-ink-muted)]">
          The v2.0 pricing upgrade rolls out in five phases. Status derived
          from the currently deployed build tag.
        </p>
        <ul className="mt-6 space-y-4">
          {shipList.map((phase) => (
            <li
              key={phase.id}
              className="flex items-start gap-3 rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-4"
            >
              <ShipIcon status={phase.status} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--fintech-ink)]">
                  {phase.label}
                  <span className="ml-2 text-[11px] font-medium uppercase tracking-wider text-[var(--fintech-ink-muted)]">
                    {phase.status === "shipped"
                      ? "Shipped"
                      : phase.status === "in_progress"
                        ? "In progress"
                        : "Planned"}
                  </span>
                </p>
                <p className="mt-1 text-sm text-[var(--fintech-ink-muted)]">
                  {phase.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingCtaStrip
        headline="Follow every ship."
        primary={{ href: "/changelog", label: "Changelog" }}
        secondary={{ href: "/security-audit", label: "Security audit" }}
      />
    </MarketingShell>
  );
}
