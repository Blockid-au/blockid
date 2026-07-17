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
  Dot,
  Sparkles,
} from "lucide-react";

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
