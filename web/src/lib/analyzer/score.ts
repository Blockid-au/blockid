// Pure scoring for the Code/Website Analyzer.
//
// No I/O, no env vars, no side effects — all math for the sub_score + valuation
// adjuster lives here so it can be unit-tested with static fixtures.
//
// See docs/analyzer/CODE_WEBSITE_ANALYZER.md for the full contract.

import type {
  AnalyzerScoreResult,
  AnalyzerSignals,
  GithubSignals,
  WebsiteSignals,
} from "./types";

// ── Normalizers ────────────────────────────────────────────────────────────

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function piecewise(x: number, points: Array<[number, number]>): number {
  const sorted = points.slice().sort((a, b) => a[0] - b[0]);
  if (x <= sorted[0]![0]) return sorted[0]![1];
  if (x >= sorted[sorted.length - 1]![0]) return sorted[sorted.length - 1]![1];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [x0, y0] = sorted[i]!;
    const [x1, y1] = sorted[i + 1]!;
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return sorted[sorted.length - 1]![1];
}

const OSI_APPROVED = new Set([
  "MIT",
  "Apache-2.0",
  "GPL-2.0",
  "GPL-3.0",
  "AGPL-3.0",
  "LGPL-2.1",
  "LGPL-3.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "MPL-2.0",
  "ISC",
]);

function scoreGithub(gh: GithubSignals): { score: number; contribs: Contrib[] } {
  const contribs: Contrib[] = [];
  const push = (label: string, weight: number, raw: number) => {
    contribs.push({ label, weight, raw: clamp(raw), weighted: (clamp(raw) * weight) / 100 });
  };

  push(
    "Commit frequency",
    20,
    gh.commitsPerMonth == null
      ? 0
      : piecewise(gh.commitsPerMonth, [
          [0, 0],
          [5, 30],
          [10, 60],
          [30, 100],
        ]),
  );
  push(
    "Contributors",
    10,
    gh.contributors == null
      ? 0
      : piecewise(gh.contributors, [
          [0, 0],
          [1, 20],
          [3, 60],
          [10, 100],
        ]),
  );
  push(
    "Stars",
    8,
    gh.stars == null
      ? 0
      : piecewise(gh.stars, [
          [0, 0],
          [50, 50],
          [500, 90],
          [5000, 100],
        ]),
  );
  push("Automated tests", 18, gh.hasTests ? 100 : 0);
  push("CI/CD workflow", 12, gh.hasCI ? 100 : 0);
  push(
    "License",
    7,
    gh.license == null ? 0 : OSI_APPROVED.has(gh.license) ? 100 : 50,
  );
  push("README completeness", 10, gh.readmeCompleteness ?? 0);
  push("Primary language declared", 5, gh.primaryLanguage ? 100 : 0);

  const totalWeight = contribs.reduce((a, c) => a + c.weight, 0);
  const raw = contribs.reduce((a, c) => a + c.weighted, 0);
  const normalized = totalWeight > 0 ? (raw / totalWeight) * 100 : 0;
  return { score: Math.round(clamp(normalized)), contribs };
}

function scoreWebsite(ws: WebsiteSignals): { score: number; contribs: Contrib[] } {
  const contribs: Contrib[] = [];
  const push = (label: string, weight: number, raw: number) => {
    contribs.push({ label, weight, raw: clamp(raw), weighted: (clamp(raw) * weight) / 100 });
  };

  push("HTTPS", 10, ws.https ? 100 : 0);
  push(
    "TTFB",
    10,
    ws.ttfbMs == null
      ? 0
      : piecewise(ws.ttfbMs, [
          [100, 100],
          [500, 60],
          [1000, 30],
          [2000, 0],
        ]),
  );
  push("Lighthouse performance", 20, ws.perf ?? 0);
  push("Lighthouse SEO", 15, ws.seo ?? 0);
  push("Lighthouse accessibility", 10, ws.a11y ?? 0);
  push("sitemap.xml", 5, ws.hasSitemap ? 100 : 0);
  push("robots.txt", 5, ws.hasRobots ? 100 : 0);
  push(
    "Meta tags",
    5,
    ws.metaTagCount == null
      ? 0
      : piecewise(ws.metaTagCount, [
          [0, 0],
          [2, 40],
          [8, 100],
        ]),
  );

  const totalWeight = contribs.reduce((a, c) => a + c.weight, 0);
  const raw = contribs.reduce((a, c) => a + c.weighted, 0);
  const normalized = totalWeight > 0 ? (raw / totalWeight) * 100 : 0;
  return { score: Math.round(clamp(normalized)), contribs };
}

// ── Rationale (top strengths + gaps) ───────────────────────────────────────

interface Contrib {
  label: string;
  weight: number;
  raw: number;
  weighted: number; // raw * weight / 100
}

function buildRationale(all: Contrib[]): string[] {
  const strengths = all
    .filter((c) => c.raw >= 70)
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 5)
    .map((c) => `Strong: ${c.label} (${Math.round(c.raw)}/100, weight ${c.weight})`);
  const gaps = all
    .filter((c) => c.raw < 40)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((c) => `Gap: ${c.label} (${Math.round(c.raw)}/100, weight ${c.weight})`);
  return [...strengths, ...gaps];
}

// ── Adjuster ───────────────────────────────────────────────────────────────

export function valuationAdjusterFor(subScore: number): number {
  if (subScore < 40) return -10;
  if (subScore < 70) return 0;
  if (subScore < 85) return 5;
  return 12;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function scoreAnalyzer(signals: AnalyzerSignals): AnalyzerScoreResult {
  const contribs: Contrib[] = [];
  let githubSide: number | null = null;
  let websiteSide: number | null = null;

  if (signals.github) {
    const gh = scoreGithub(signals.github);
    githubSide = gh.score;
    contribs.push(...gh.contribs);
  }
  if (signals.website) {
    const ws = scoreWebsite(signals.website);
    websiteSide = ws.score;
    contribs.push(...ws.contribs);
  }

  let subScore = 0;
  if (githubSide != null && websiteSide != null) {
    subScore = Math.round(0.6 * githubSide + 0.4 * websiteSide);
  } else if (githubSide != null) {
    subScore = githubSide;
  } else if (websiteSide != null) {
    subScore = websiteSide;
  }

  return {
    sub_score: clamp(Math.round(subScore)),
    valuation_adjuster_pct: valuationAdjusterFor(subScore),
    rationale: buildRationale(contribs),
    breakdown: { githubSide, websiteSide },
  };
}
