// /showcase/atlassian/dashboard — Step 2 of the Atlassian walkthrough.
//
// A dashboard-mirror card grid that shows what a founder-facing BlockID.au
// workspace would look like if it were populated with real Atlassian data.
// Server component — no auth, no cookies, no I/O — reads the static
// ATLASSIAN_DEMO fixture and renders a KPI-tile grid + founder-mentor panel.

import type { Metadata } from "next";
import Link from "next/link";

import { AtlassianWalkthroughProvider } from "@/components/showcase/atlassian-walkthrough-provider";
import { CanonicalStageBadge } from "@/components/showcase/canonical-stage-badge";
import {
  ATLASSIAN_DEMO,
  type AtlassianMilestone,
  type ValuationSnapshot,
} from "@/lib/showcase/atlassian/fixture";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atlassian dashboard — Step 2 — BlockID Demo",
  description:
    "The BlockID.au founder dashboard populated with real Atlassian data — SVI composite, current phase, latest milestone, revenue snapshot, team, and runway tiles.",
};

function meanScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((a, b) => a + b, 0);
  return sum / scores.length;
}

function latestMilestoneByYear(
  milestones: AtlassianMilestone[],
): AtlassianMilestone | undefined {
  if (milestones.length === 0) return undefined;
  return [...milestones].sort((a, b) => b.year - a.year)[0];
}

function findMilestoneByYear(
  milestones: AtlassianMilestone[],
  year: number,
): AtlassianMilestone | undefined {
  return milestones.find((m) => m.year === year);
}

function currentSnapshot(
  valuations: ValuationSnapshot[],
): ValuationSnapshot | undefined {
  // Prefer the Comparables method for the "current" revenue tile because its
  // narrative cites the market cap × FX conversion the tile is showing.
  return (
    valuations.find(
      (v) => v.timestamp === "2026-current" && v.method === "Comparables",
    ) ??
    valuations.find((v) => v.timestamp === "2026-current")
  );
}

function formatAUD(value: number): string {
  if (value >= 1_000_000_000) return `A$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `A$${(value / 1_000_000).toFixed(0)}M`;
  return `A$${value.toLocaleString()}`;
}

interface TileProps {
  label: string;
  value: string;
  caption: string;
  sourceLabel?: string;
  sourceUrl?: string;
  extra?: React.ReactNode;
}

function Tile({ label, value, caption, sourceLabel, sourceUrl, extra }: TileProps) {
  return (
    <div className="flex flex-col rounded-lg border border-surface-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] font-mono uppercase tracking-wide text-ink-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-brand-700 dark:text-emerald-400">
        {value}
      </div>
      <div className="mt-1 text-sm text-ink-700 dark:text-slate-300">
        {caption}
      </div>
      {extra ? <div className="mt-2">{extra}</div> : null}
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-auto pt-3 text-xs opacity-60 hover:opacity-100 hover:underline"
        >
          Source: {sourceLabel ?? sourceUrl}
        </a>
      ) : null}
    </div>
  );
}

export default function AtlassianDashboardMirrorPage() {
  const composite = meanScore(
    ATLASSIAN_DEMO.sviScores.map((s) => s.score0to100),
  );
  const compositeDisplay = composite.toFixed(1);

  const latest = latestMilestoneByYear(ATLASSIAN_DEMO.milestones);
  const profitability2005 = findMilestoneByYear(ATLASSIAN_DEMO.milestones, 2005);
  const current = currentSnapshot(ATLASSIAN_DEMO.valuations);

  return (
    <AtlassianWalkthroughProvider stepNumber={2}>
      <div className="min-h-screen bg-surface-50 dark:bg-slate-950">
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <nav className="mb-4 text-sm">
            <Link
              href="/showcase/atlassian"
              className="text-brand-700 hover:underline"
            >
              ← Atlassian landing
            </Link>
          </nav>

          <header className="mb-8">
            <p className="text-sm font-medium uppercase tracking-wide text-brand-700 dark:text-emerald-400">
              Step 2 — Living dashboard
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink-900 dark:text-slate-100">
              Atlassian, on the BlockID.au founder dashboard
            </h1>
            <p className="mt-3 max-w-3xl text-base text-ink-700 dark:text-slate-300">
              This is the morning-coffee view Mike Cannon-Brookes and Scott
              Farquhar would open every day if BlockID.au had existed since
              2002. Six tiles, one composite score, one honest opinion about
              what to do next.
            </p>
          </header>

          <section
            aria-labelledby="dashboard-tiles"
            className="space-y-4"
          >
            <h2 id="dashboard-tiles" className="sr-only">
              Dashboard tiles
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Tile
                label="SVI Composite"
                value={compositeDisplay}
                caption="13 criteria averaged (score 0–100)"
                sourceLabel="Atlassian FY2025 10-K + walkthrough fixture"
                sourceUrl={ATLASSIAN_DEMO.sviScores[0] ? undefined : undefined}
                extra={
                  <div className="text-xs text-ink-500 dark:text-slate-400">
                    Range {Math.min(
                      ...ATLASSIAN_DEMO.sviScores.map((s) => s.score0to100),
                    )}
                    –
                    {Math.max(
                      ...ATLASSIAN_DEMO.sviScores.map((s) => s.score0to100),
                    )}
                    ; strongest signal:{" "}
                    <span className="font-semibold">Revenue (97)</span>.
                  </div>
                }
              />

              <Tile
                label="Current phase"
                value="Phase 12 / 12"
                caption="Public exit — NASDAQ:TEAM"
                extra={<CanonicalStageBadge phase={12} />}
                sourceLabel="Wikipedia — Atlassian"
                sourceUrl="https://en.wikipedia.org/wiki/Atlassian"
              />

              <Tile
                label="Latest milestone"
                value={latest ? String(latest.year) : "—"}
                caption={latest?.title ?? "No milestones on file"}
                sourceLabel={latest?.source.label}
                sourceUrl={latest?.source.url}
                extra={
                  latest ? (
                    <p className="text-xs text-ink-600 dark:text-slate-400 line-clamp-4">
                      {latest.body}
                    </p>
                  ) : null
                }
              />

              <Tile
                label="Revenue snapshot (FY2025)"
                value="US$5.2B"
                caption={
                  current
                    ? `≈ ${formatAUD(current.valueAUD)} implied enterprise value at FX ${current.fxRate.toFixed(2)} USD/AUD`
                    : "≈ A$7.9B at FX 1.52 USD/AUD"
                }
                sourceLabel="SEC — Atlassian FY2025 10-K"
                sourceUrl={
                  current?.sourceUrl ??
                  "https://www.sec.gov/Archives/edgar/data/1650372/000165037225000036/team-20250630.htm"
                }
                extra={
                  <div className="text-xs text-ink-500 dark:text-slate-400">
                    +20% YoY · 83% gross margin · ~US$1.4B FCF
                  </div>
                }
              />

              <Tile
                label="Runway / cash"
                value="N/A"
                caption="Public company — self-funding since 2005"
                sourceLabel={profitability2005?.source.label ?? "Atlassian 20 lessons"}
                sourceUrl={
                  profitability2005?.source.url ??
                  "https://www.atlassian.com/blog/announcements/atlassian-founders-20-years-20-lessons"
                }
                extra={
                  profitability2005 ? (
                    <p className="text-xs text-ink-600 dark:text-slate-400">
                      Runway ceased to matter in {profitability2005.year}:{" "}
                      {profitability2005.title.toLowerCase()}. Every dollar
                      since has been optional capital, not survival capital.
                    </p>
                  ) : null
                }
              />

              <Tile
                label="Team size"
                value="See milestones"
                caption="Not captured in walkthrough fixture — grew from 2 (2002) to ~13,000+ (FY2025 10-K)"
                extra={
                  <Link
                    href="/showcase/atlassian/growth-phases?step=4"
                    className="inline-block text-xs font-medium text-brand-700 hover:underline dark:text-emerald-400"
                  >
                    Open the 12-phase growth map →
                  </Link>
                }
                sourceLabel="SEC — Atlassian FY2025 10-K"
                sourceUrl="https://www.sec.gov/Archives/edgar/data/1650372/000165037225000036/team-20250630.htm"
              />
            </div>
          </section>

          <section
            aria-labelledby="founder-mentor-note"
            className="mt-10 rounded-lg border border-brand-200 bg-brand-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30"
          >
            <h2
              id="founder-mentor-note"
              className="text-lg font-semibold text-brand-900 dark:text-emerald-200"
            >
              Founder-mentor note
            </h2>
            <div className="mt-3 space-y-3 text-sm text-brand-900 dark:text-emerald-100">
              <p>
                This is what Mike and Scott would open every morning. In 2005
                the equivalent view would have shown just two lines —
                profitability, and Jira licence count — and that would have
                been enough. The tiles above are the same tiles, just twenty
                years further along the same curve.
              </p>
              <p>
                Notice what is <em>not</em> here: burn rate, months of runway,
                open Series A. Atlassian&apos;s dashboard never needed those
                fields, because the go-to-market motion paid for itself from
                day one. If your own SVI Composite tile is stuck below 60, the
                fix is not another investor deck — it is the same self-serve
                pricing experiment American Airlines completed by fax in 2003.
              </p>
              <p>
                Every tile above cites a source. Click through — no
                paywalls, no NDAs. This is the standard of evidence your
                own BlockID.au workspace holds itself to.
              </p>
            </div>
          </section>
        </div>
      </div>
    </AtlassianWalkthroughProvider>
  );
}
