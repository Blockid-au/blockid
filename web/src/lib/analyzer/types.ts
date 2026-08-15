// Shared types for the Code/Website Analyzer.
//
// Kept in a separate file so `score.ts` stays pure (no server-only imports) and
// can be safely bundled into the vitest test bundle without pulling in fetch
// polyfills or process.env.

export interface GithubSignals {
  commitsPerMonth: number | null; // last-90d commits ÷ 3
  contributors: number | null;
  stars: number | null;
  primaryLanguage: string | null;
  hasTests: boolean | null;
  hasCI: boolean | null;
  license: string | null; // spdx id, e.g. "MIT", "Apache-2.0"
  readmeCompleteness: number | null; // 0-100
}

export interface WebsiteSignals {
  https: boolean | null;
  ttfbMs: number | null;
  perf: number | null; // 0-100
  seo: number | null; // 0-100
  a11y: number | null; // 0-100
  hasSitemap: boolean | null;
  hasRobots: boolean | null;
  metaTagCount: number | null;
}

export interface AnalyzerSignals {
  github?: GithubSignals | null;
  website?: WebsiteSignals | null;
}

export interface AnalyzerScoreResult {
  sub_score: number; // 0-100 additive PTD sub-score
  valuation_adjuster_pct: number; // -10 | 0 | 5 | 12
  rationale: string[]; // human-readable strengths + gaps
  breakdown: {
    githubSide: number | null;
    websiteSide: number | null;
  };
}
