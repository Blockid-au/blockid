import type { Metadata } from "next";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The BlockID Team — 11 AI-Agent C-Levels",
  description:
    "BlockID.au is operated by a fleet of AI C-Level agents. Each role self-upgrades the platform and powers customer reports.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://blockid.au/team" },
};

type RosterRow = {
  slug: string;
  role: string;
  tagline: string;
  last30d_count: number;
  latest_activity_date: string | null;
};

function readRoster(): RosterRow[] {
  const candidates = [
    path.join(process.cwd(), "web", "content", "team-roster.json"),
    path.join(process.cwd(), "content", "team-roster.json"),
    path.join(process.cwd(), "..", "web", "content", "team-roster.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, "utf-8");
      return JSON.parse(raw) as RosterRow[];
    } catch {
      // try next
    }
  }
  return [];
}

// Short one-line tagline extracted from the SKILL.md description
// (the front-matter blurb reads: "<role> — <tagline>. Use when '<...>'.").
function shortTagline(row: RosterRow): string {
  const stripped = row.tagline.split(". Use when")[0] ?? row.tagline;
  const em = stripped.indexOf("—");
  return (em >= 0 ? stripped.slice(em + 1) : stripped).trim();
}

export default function TeamPage() {
  const roster = readRoster();
  const totalShips = roster.reduce((s, r) => s + r.last30d_count, 0);
  const activeRoles = roster.filter((r) => r.last30d_count > 0).length;

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="The team"
        title={`${roster.length || 11} AI-agent C-Levels, one workflow`}
        subtitle="Each role self-upgrades the platform and powers customer reports. Cards show live shipping activity from the last 30 days."
      />

      <section
        aria-label="Team roster"
        className="mx-auto max-w-6xl px-6 py-12 sm:py-16"
      >
        {/* Summary bar */}
        <div className="mb-10 rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] px-6 py-5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="font-mono text-2xl font-extrabold tabular-nums text-[var(--fintech-accent)]">
                {roster.length}
              </p>
              <p className="mt-1 text-xs text-[var(--fintech-ink-muted)]">
                Roles staffed
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-extrabold tabular-nums text-[var(--fintech-accent)]">
                {activeRoles}
              </p>
              <p className="mt-1 text-xs text-[var(--fintech-ink-muted)]">
                Active in last 30 days
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-extrabold tabular-nums text-[var(--fintech-accent)]">
                {totalShips}
              </p>
              <p className="mt-1 text-xs text-[var(--fintech-ink-muted)]">
                Reports & ships (30d)
              </p>
            </div>
          </div>
        </div>

        {/* Grid */}
        {roster.length === 0 ? (
          <p className="text-sm text-[var(--fintech-ink-muted)]">
            Team roster not yet published for this environment. Run
            <code className="mx-1 rounded bg-[var(--fintech-surface)] px-1.5 py-0.5 text-[0.85em]">
              node scripts/docs/regenerate-team-page.mjs
            </code>
            to populate this page.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {roster.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/team/${r.slug}`}
                  className="group block h-full rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6 transition-colors hover:border-[var(--fintech-accent)]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fintech-accent)]">
                      {r.slug === "customer-success"
                        ? "CS"
                        : r.slug.toUpperCase()}
                    </p>
                    <span className="rounded-full border border-[var(--fintech-border)] px-2 py-0.5 font-mono text-[10px] tabular-nums text-[var(--fintech-ink-muted)]">
                      {r.last30d_count} 30d
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-[var(--fintech-ink)]">
                    {r.role}
                  </h3>
                  <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
                    {shortTagline(r)}
                  </p>
                  <p className="mt-4 text-xs text-[var(--fintech-ink-muted)]">
                    {r.latest_activity_date
                      ? `Last shipped ${r.latest_activity_date}`
                      : "No activity this window"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MarketingCtaStrip
        headline="See what shipped, and what's next."
        primary={{ href: "/changelog", label: "Changelog" }}
        secondary={{ href: "/roadmap", label: "Roadmap" }}
      />
    </MarketingShell>
  );
}
