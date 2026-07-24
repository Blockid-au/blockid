// /showcase/atlassian/svi-report — Step 3 of the Atlassian walkthrough.
//
// The BlockID SVI score, 13 criteria, applied to Atlassian. Server component
// only — no auth, no cookies, no I/O — reads the static ATLASSIAN_DEMO
// fixture, joins each SVI criterion score to the human labels from
// evaluation-criteria.ts, and renders:
//   - Hero card with the composite (mean rounded to 1dp).
//   - Grid of 13 mini-cards (name + score + rationale + source URL).
//   - Inline SVG horizontal-bar chart sorted descending.
//   - "Why this score" narrative panel covering top 3 + bottom 3 criteria.

import type { Metadata } from "next";
import Link from "next/link";

import { AtlassianWalkthroughProvider } from "@/components/showcase/atlassian-walkthrough-provider";
import {
  ATLASSIAN_DEMO,
  type PhaseSnapshot,
  type SVIScore,
} from "@/lib/showcase/atlassian/fixture";
import { CRITERIA, type CriterionKey } from "@/lib/evaluation-criteria";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atlassian SVI report — Step 3 — BlockID Demo",
  description:
    "BlockID's Startup Valuation Index scores Atlassian across 13 criteria — from Idea & Innovation to Revenue & Unit Economics — with a rationale + source for each.",
};

interface EnrichedScore {
  key: CriterionKey;
  title: string;
  subtitle: string;
  score: number;
  rationale: string;
  sourceLabel: string;
  sourceUrl: string;
}

function enrichScores(scores: SVIScore[]): EnrichedScore[] {
  return scores.map((s) => {
    const def = CRITERIA.find((c) => c.key === (s.criterion as CriterionKey));
    // Ground each criterion in the phase snapshot whose slug matches the
    // primary journey moment for that criterion. Fall back to the FY2025
    // 10-K when no explicit mapping exists — the score-97 revenue tile is
    // the anchor for the whole report.
    const snapshot: PhaseSnapshot | undefined = pickSnapshotForCriterion(
      s.criterion as CriterionKey,
      ATLASSIAN_DEMO.phaseSnapshots,
    );
    return {
      key: s.criterion as CriterionKey,
      title: def?.title ?? s.criterion,
      subtitle: def?.subtitle ?? "",
      score: s.score0to100,
      rationale: s.rationale,
      sourceLabel: snapshot ? `Phase ${snapshot.phaseSlug} snapshot` : "SEC 10-K",
      sourceUrl:
        snapshot?.sourceUrl ??
        "https://www.sec.gov/Archives/edgar/data/1650372/000165037225000036/team-20250630.htm",
    };
  });
}

function pickSnapshotForCriterion(
  key: CriterionKey,
  snapshots: PhaseSnapshot[],
): PhaseSnapshot | undefined {
  // Rough mapping — each criterion is grounded in the phase where its
  // evidence peaked in Atlassian's story.
  const phaseByCriterion: Record<CriterionKey, string> = {
    idea: "1",
    market: "3",
    founder_profile: "1",
    code_git: "11",
    website: "5",
    team: "8",
    customer_size: "5",
    gtm_strategy: "5",
    documents: "10",
    dataroom: "10",
    team_structure: "8",
    roadmap: "11",
    revenue: "11",
  };
  const target = phaseByCriterion[key];
  return snapshots.find((s) => s.phaseSlug === target);
}

function scoreColor(score: number): string {
  if (score >= 85) return "#16a34a"; // green-600
  if (score >= 70) return "#eab308"; // yellow-500
  return "#dc2626"; // red-600
}

function scoreBadgeClass(score: number): string {
  if (score >= 85)
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200";
  if (score >= 70)
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200";
  return "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200";
}

export default function AtlassianSviReportMirrorPage() {
  const enriched = enrichScores(ATLASSIAN_DEMO.sviScores);
  const composite =
    enriched.reduce((sum, s) => sum + s.score, 0) / (enriched.length || 1);
  const compositeDisplay = composite.toFixed(1);
  const sortedDesc = [...enriched].sort((a, b) => b.score - a.score);
  const top3 = sortedDesc.slice(0, 3);
  const bottom3 = sortedDesc.slice(-3).reverse();

  // Chart geometry. Fixed viewBox so the SVG scales cleanly at any width.
  const CHART_WIDTH = 800;
  const ROW_H = 26;
  const LABEL_COL = 210;
  const BAR_MAX = CHART_WIDTH - LABEL_COL - 60;
  const chartHeight = sortedDesc.length * ROW_H + 12;

  return (
    <AtlassianWalkthroughProvider stepNumber={3}>
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
              Step 3 — SVI score, 13 criteria
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink-900 dark:text-slate-100">
              Atlassian on the BlockID Startup Valuation Index
            </h1>
            <p className="mt-3 max-w-3xl text-base text-ink-700 dark:text-slate-300">
              We ran Atlassian through the same 13-criteria grader we hand
              every founder on BlockID.au. Below is the composite, the
              per-criterion breakdown, and the founder-mentor reasoning
              behind the three best and three worst scores.
            </p>
          </header>

          <section
            aria-labelledby="svi-hero"
            className="mb-8 rounded-lg border border-brand-200 bg-brand-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30"
          >
            <h2
              id="svi-hero"
              className="text-xs font-mono uppercase tracking-wide text-brand-800 dark:text-emerald-300"
            >
              Composite SVI
            </h2>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <div className="text-6xl font-bold text-brand-900 dark:text-emerald-100">
                {compositeDisplay}
              </div>
              <div className="text-lg text-brand-800 dark:text-emerald-200">
                / 100
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm text-brand-900 dark:text-emerald-100">
              SVI 92/100 — if BlockID had scored 2015-IPO-era Atlassian. The
              lowest single-criterion score is 85 (dataroom), the highest is
              97 (revenue). No criterion is red, no criterion is a coin-flip.
            </p>
          </section>

          <section aria-labelledby="svi-chart" className="mb-10">
            <h2
              id="svi-chart"
              className="mb-3 text-xl font-semibold text-ink-900 dark:text-slate-100"
            >
              13 criteria — ranked
            </h2>
            <div className="overflow-x-auto rounded-lg border border-surface-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <svg
                role="img"
                aria-label="Horizontal bar chart of 13 SVI criterion scores, sorted from highest to lowest"
                viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`}
                className="h-auto w-full min-w-[640px]"
              >
                {sortedDesc.map((s, i) => {
                  const y = i * ROW_H + 8;
                  const width = (s.score / 100) * BAR_MAX;
                  const color = scoreColor(s.score);
                  return (
                    <g key={s.key}>
                      <text
                        x={LABEL_COL - 8}
                        y={y + ROW_H / 2 + 4}
                        textAnchor="end"
                        fontSize={11}
                        fill="currentColor"
                        className="fill-ink-700 dark:fill-slate-300"
                      >
                        {s.title}
                      </text>
                      <rect
                        x={LABEL_COL}
                        y={y}
                        width={BAR_MAX}
                        height={ROW_H - 8}
                        rx={3}
                        className="fill-surface-100 dark:fill-slate-800"
                      />
                      <rect
                        x={LABEL_COL}
                        y={y}
                        width={Math.max(width, 1)}
                        height={ROW_H - 8}
                        rx={3}
                        fill={color}
                      >
                        <title>
                          {s.title}: {s.score} / 100
                        </title>
                      </rect>
                      <text
                        x={LABEL_COL + width + 6}
                        y={y + ROW_H / 2 + 4}
                        fontSize={11}
                        fontWeight={600}
                        fill="currentColor"
                        className="fill-ink-800 dark:fill-slate-100"
                      >
                        {s.score}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </section>

          <section aria-labelledby="svi-grid" className="mb-10">
            <h2
              id="svi-grid"
              className="mb-3 text-xl font-semibold text-ink-900 dark:text-slate-100"
            >
              Criterion detail
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {enriched.map((s) => (
                <article
                  key={s.key}
                  className="flex flex-col rounded-lg border border-surface-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-ink-900 dark:text-slate-100">
                        {s.title}
                      </h3>
                      {s.subtitle ? (
                        <p className="mt-0.5 text-[11px] text-ink-500 dark:text-slate-400">
                          {s.subtitle}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${scoreBadgeClass(s.score)}`}
                    >
                      {s.score}
                    </span>
                  </div>
                  <p className="mt-2 flex-1 text-xs text-ink-700 dark:text-slate-300">
                    {s.rationale}
                  </p>
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 text-[11px] opacity-60 hover:opacity-100 hover:underline"
                  >
                    Source: {s.sourceLabel}
                  </a>
                </article>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="svi-why"
            className="rounded-lg border border-brand-200 bg-brand-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30"
          >
            <h2
              id="svi-why"
              className="text-lg font-semibold text-brand-900 dark:text-emerald-100"
            >
              Why this score
            </h2>

            <div className="mt-4 space-y-3 text-sm text-brand-900 dark:text-emerald-100">
              <p>
                <strong>Revenue ({top3[0]?.score}) is the anchor.</strong>{" "}
                US$5.2B FY2025 revenue at 83% gross margin, generating ~US$1.4B
                free cash flow, is the single hardest number in AU tech.
                Every other criterion inherits credibility from it.
              </p>
              <p>
                <strong>Customer size ({top3[1]?.score}) and founder profile ({top3[2]?.score})</strong>{" "}
                come next. American Airlines faxed in a Jira order in 2003 with
                no salesperson in the loop — the moment product-led growth
                stopped being theory. Cannon-Brookes and Farquhar co-CEO&apos;d
                for 22 years — that co-founder half-life is what founder-profile
                scoring rewards.
              </p>
              <p>
                <strong>The three weakest scores are still ≥ 85.</strong>{" "}
                Dataroom ({bottom3[0]?.score}), documents ({bottom3[1]?.score}),
                and team structure ({bottom3[2]?.score}) all lose a few points
                for pre-IPO disclosure gaps we can only infer — the actual
                dataroom passed T. Rowe Price + Sequoia due diligence in 2014,
                but the 2005-era version is invisible to the public web.
              </p>
              <p>
                For the phase-by-phase back-story behind these numbers, see the{" "}
                <Link
                  href="/showcase/atlassian/growth-phases?step=4"
                  className="underline"
                >
                  12-phase growth map (step 4)
                </Link>
                . Each phase snapshot cites the same evidence base each score
                is grounded in.
              </p>
            </div>
          </section>
        </div>
      </div>
    </AtlassianWalkthroughProvider>
  );
}
