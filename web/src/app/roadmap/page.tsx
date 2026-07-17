import type { Metadata } from "next";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Compass,
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

// The current phase in the platform ladder. Cap Table (Phase 5) is where the
// mid-2026 build is concentrated — SVI, valuation, equity and ESOP surfaces are
// already live, tokenisation onward is compliance-gated.
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

function readVersion(): VersionFile | null {
  try {
    const p = path.join(
      process.cwd(),
      "content",
      "reports",
      "version.json",
    );
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw) as VersionFile;
  } catch {
    try {
      const p = path.join(
        process.cwd(),
        "web",
        "content",
        "reports",
        "version.json",
      );
      const raw = fs.readFileSync(p, "utf-8");
      return JSON.parse(raw) as VersionFile;
    } catch {
      return null;
    }
  }
}

function quarterShipList(version: VersionFile | null): QuarterPhase[] {
  const v = version?.version ?? "";
  // Anything at or beyond v2.0.0-beta counts Phase 0-2 as shipped and Phase 3-4
  // as partial/in-progress. Refine by parsing the beta counter when available.
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
        className="h-5 w-5 shrink-0 text-brand-cyan"
      />
    );
  }
  if (status === "in_progress") {
    return (
      <Circle
        aria-label="In progress"
        className="h-5 w-5 shrink-0 text-brand-cyan/70"
      />
    );
  }
  return (
    <Dot
      aria-label="Planned"
      className="h-5 w-5 shrink-0 text-brand-ink-muted"
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
    <div data-theme="lux" className="min-h-svh bg-brand-navy-deep text-brand-ink">
      <PageViewTracker event="roadmap_viewed" params={{}} />
      <Navbar />

      <main className="mx-auto max-w-7xl px-6 pt-24 pb-24">
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">
            <Compass aria-hidden="true" className="h-3.5 w-3.5" />
            Roadmap
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-brand-ink sm:text-5xl">
            <span className="lux-heading">Where BlockID is going</span>
          </h1>
          <p className="mt-4 text-lg text-brand-ink-muted">
            Eight stages, one workspace, one audit trail. SVI baseline to
            valuation, equity, ESOP, cap table, tokenisation, dividend and exit —
            all derived from data you can inspect and re-run. Below is what has
            shipped, what is building this quarter, and what is compliance-gated
            until legal review passes.
          </p>
        </div>

        {/* Current milestone */}
        <section
          aria-labelledby="current-milestone"
          className="mt-16 rounded-3xl border border-brand-cyan/20 bg-brand-navy-elev-1 p-8 shadow-lg lux-glow-cyan"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2
              id="current-milestone"
              className="text-xl font-semibold text-brand-ink"
            >
              Current milestone
            </h2>
            {version?.version ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1 text-xs font-semibold text-brand-cyan">
                <Sparkles aria-hidden="true" className="h-3 w-3" />
                {version.version}
              </span>
            ) : null}
          </div>

          {version ? (
            <>
              <p className="mt-2 text-sm text-brand-ink-muted">
                {version.release_id ? `${version.release_id} · ` : ""}
                Updated {formatDate(version.updated_at)}
                {version.git_sha ? ` · git ${version.git_sha}` : ""}
              </p>
              {topTasks.length > 0 ? (
                <ul className="mt-6 space-y-3">
                  {topTasks.map((task, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-sm text-brand-ink"
                    >
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0 text-brand-cyan"
                      />
                      <span>{task}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-brand-ink-muted">
                  No task IDs listed in this release manifest.
                </p>
              )}
              <div className="mt-6">
                <Link
                  href="/changelog"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-cyan hover:text-brand-blue-bright"
                >
                  Full changelog
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-brand-ink-muted">
              Release manifest not yet published for this environment. The next
              deploy will populate this panel.
            </p>
          )}
        </section>

        {/* The 8 platform phases */}
        <section aria-labelledby="platform-phases" className="mt-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2
              id="platform-phases"
              className="text-3xl font-bold tracking-tight text-brand-ink sm:text-4xl"
            >
              The 8 platform stages
            </h2>
            <p className="mt-3 text-brand-ink-muted">
              Idea to exit in one register, one audit trail. Every stage feeds
              the next — the SVI evidence you upload on Day 0 flows through to
              your data-room on the day you sell.
            </p>
          </div>

          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORM_PHASES.map((p) => {
              const inProgress = p.number === CURRENT_PLATFORM_PHASE;
              return (
                <li
                  key={p.number}
                  className="relative flex flex-col rounded-2xl border border-brand-cyan/15 bg-brand-navy-elev-1 p-6"
                >
                  {inProgress ? (
                    <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-brand-cyan/40 bg-brand-cyan/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-cyan">
                      In progress
                    </span>
                  ) : null}
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">
                    Stage {p.number}
                  </span>
                  <h3 className="mt-2 text-lg font-semibold text-brand-ink">
                    {p.name}
                  </h3>
                  <p className="mt-1 text-xs uppercase tracking-wider text-brand-ink-muted">
                    {p.subtitle}
                  </p>
                  <p className="mt-3 text-sm text-brand-ink-muted">
                    {p.blurb}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* This quarter's ship list */}
        <section
          aria-labelledby="quarter-ship-list"
          className="mt-20 rounded-3xl border border-brand-cyan/15 bg-brand-navy-elev-1 p-8"
        >
          <h2
            id="quarter-ship-list"
            className="text-2xl font-bold tracking-tight text-brand-ink"
          >
            This quarter&apos;s ship list
          </h2>
          <p className="mt-2 text-sm text-brand-ink-muted">
            The v2.0 pricing upgrade rolls out in five phases. Status derived
            from the currently deployed build tag.
          </p>

          <ul className="mt-6 space-y-4">
            {shipList.map((phase) => (
              <li
                key={phase.id}
                className="flex items-start gap-3 rounded-xl border border-brand-cyan/10 bg-brand-navy-deep/40 p-4"
              >
                <ShipIcon status={phase.status} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-brand-ink">
                    {phase.label}
                    <span className="ml-2 text-[11px] font-medium uppercase tracking-wider text-brand-ink-muted">
                      {phase.status === "shipped"
                        ? "Shipped"
                        : phase.status === "in_progress"
                          ? "In progress"
                          : "Planned"}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-brand-ink-muted">
                    {phase.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Footer CTA */}
        <div className="mt-16 rounded-3xl border border-brand-cyan/20 bg-brand-navy-elev-1 p-10 text-center shadow-lg lux-glow-cyan">
          <h2 className="text-2xl font-bold text-brand-ink">
            Follow every ship
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-ink-muted">
            The changelog is auto-generated from git and task IDs. The pricing
            page lists exactly what each tier unlocks. The security audit
            summary tracks our disclaimer registry, hash-chain integrity, and
            outstanding findings.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/changelog"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-blue-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Changelog
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-2xl border border-brand-cyan/40 px-6 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Pricing
            </Link>
            <Link
              href="/security-audit"
              className="inline-flex items-center gap-2 rounded-2xl border border-brand-cyan/40 px-6 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Security audit
            </Link>
          </div>
          <p className="mt-6 text-xs text-brand-ink-muted">
            Not financial advice. Auschain PTY LTD · ACN 659 615 111 · Sydney
            NSW.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
