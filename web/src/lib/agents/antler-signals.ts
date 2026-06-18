// Antler-style stage-progression signals (T0222).
//
// Complementary evaluation layer alongside the deterministic 8-dimension SVI.
// Antler / Sequoia / a16z look at 5 qualitative "are they ready to level up"
// signals when deciding whether a company progresses to the next stage:
//
//   1. Team        — built things before, off-the-charts ambition, learn-it-alls,
//                    unique insight, can attract exceptional talent
//   2. Progress    — things happening fast (interviews, users, revenue, partnerships)
//   3. Invention   — new tech or significant technical leap
//   4. Unique Vision — sees the future others don't, articulates scale/severity,
//                      believable roadmap
//   5. 10X Product  — not incremental, 10× better on speed/cost/ease/quality
//
// We score each 0-100 from signals already extracted by the SVI engine
// (plus a few new keyword scans on the raw text + CI output), surface gaps
// and "how to lift this" guidance, and bubble the strongest signal as
// "what investors will see first" + the weakest as "what to fix next".
//
// Deterministic, no LLM call. Dashboard + PDF render the result.

import type { SVIAnalysis, SVIExtractedSignals } from "@/lib/svi-analysis";
import type { WebsiteCompetitiveIntelligence } from "@/lib/competitive-intelligence";

export type AntlerSignalKey = "team" | "progress" | "invention" | "vision" | "product_10x";

export type SignalStrength = "exceptional" | "strong" | "developing" | "weak";

export interface AntlerSignal {
  key: AntlerSignalKey;
  label: string;
  question: string;            // what investors are asking when they look at this
  score: number;               // 0–100
  strength: SignalStrength;
  whatWeSee: string[];         // 1-5 things detected from the input
  gaps: string[];              // 1-5 things still missing
  howToLift: string[];         // 3 concrete moves to push this score up
  weight: number;              // 0-1, contribution to combined progression score
}

export interface AntlerEvaluation {
  signals: AntlerSignal[];
  /** Aggregate readiness-to-progress score 0-100, weighted blend. */
  progressionScore: number;
  /** Single-sentence honest read of the stage-progression bar. */
  oneLine: string;
  /** "What investors will see first" — the standout signal. */
  standout: AntlerSignal | null;
  /** "What to fix next" — the lowest-scoring high-weight signal. */
  weakestLink: AntlerSignal | null;
  sourceNote: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function strengthFromScore(n: number): SignalStrength {
  if (n >= 80) return "exceptional";
  if (n >= 60) return "strong";
  if (n >= 40) return "developing";
  return "weak";
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function hasAny(text: string, kws: string[]): string | null {
  const t = text.toLowerCase();
  for (const k of kws) {
    if (t.includes(k.toLowerCase())) return k;
  }
  return null;
}

// ─── Per-signal scorers ──────────────────────────────────────────────────────

interface BuildArgs {
  analysis: SVIAnalysis;
  signals: SVIExtractedSignals;
  rawText: string;
  ci?: WebsiteCompetitiveIntelligence | null;
}

function scoreTeam({ signals, rawText, ci }: BuildArgs): AntlerSignal {
  const corpus = `${rawText} ${ci?.uniquePositioning ?? ""} ${ci?.targetCustomer ?? ""}`;
  let score = 30;
  const whatWeSee: string[] = [];
  const gaps: string[] = [];

  // Previously built / hacked together
  if (hasAny(corpus, ["previously built", "shipped", "launched product", "built and sold", "exited"])) {
    score += 25; whatWeSee.push("Founder has shipped previous product(s)");
  } else if (signals.founderExperience === "serial") {
    score += 25; whatWeSee.push("Serial founder background");
  } else if (signals.founderExperience === "experienced") {
    score += 15; whatWeSee.push("Domain-experienced founder");
  } else {
    gaps.push("No track record of previously built/launched products mentioned");
  }

  // Unique connection / insight to the problem
  if (hasAny(corpus, ["insider", "domain expert", "spent years", "worked at", "ex-", "former", "lived through"])) {
    score += 10; whatWeSee.push("Founder has unique insider connection to the problem");
  } else {
    gaps.push("Unique founder-problem fit not articulated");
  }

  // Off-the-charts ambition / learn-it-all
  if (hasAny(corpus, ["billion", "category-defining", "10x", "globally", "industry leader", "transform", "disrupting"])) {
    score += 10; whatWeSee.push("High-ambition language present");
  }

  // Team composition (co-founder, advisors, complementary skills)
  if (signals.hasCoFounder) { score += 8; whatWeSee.push("Co-founding team in place"); }
  else gaps.push("Solo founder — investors heavily prefer co-founder teams");
  if (signals.hasAdvisors) { score += 5; whatWeSee.push("Advisors named"); }
  const teamSize = (signals as unknown as { teamSize?: number }).teamSize ?? 0;
  if (teamSize > 1) { score += Math.min(8, teamSize); whatWeSee.push(`Team size ${teamSize}+`); }

  // Can attract exceptional talent — we proxy this via team size + advisor + brand-name mentions
  if (hasAny(corpus, ["ex-google", "ex-stripe", "ex-canva", "ex-atlassian", "ex-meta", "stanford", "mit", "y combinator alum"])) {
    score += 8; whatWeSee.push("Pedigree signals attract more talent");
  } else if (!signals.hasAdvisors) {
    gaps.push("No 'attracts exceptional talent' signal (brand-name advisors / hires)");
  }

  return {
    key: "team",
    label: "Team",
    question: "Have they built something before? Do they have insider insight, ambition, and the ability to attract A-players?",
    score: clamp(score),
    strength: strengthFromScore(score),
    whatWeSee: whatWeSee.slice(0, 5),
    gaps: gaps.slice(0, 5),
    howToLift: [
      "Add 2-3 lines on each founder's domain background + ship history to the About page",
      "Recruit 1-2 brand-name advisors and list them on the team page",
      "Publish a 'why us' memo in the data room making founder-problem fit explicit",
    ],
    weight: 0.25,
  };
}

function scoreProgress({ analysis, signals, rawText }: BuildArgs): AntlerSignal {
  let score = 25;
  const whatWeSee: string[] = [];
  const gaps: string[] = [];

  // Revenue (heaviest weight — biggest "things happening fast" signal)
  if (signals.hasRevenue) { score += 30; whatWeSee.push("Revenue evidence present"); }
  else gaps.push("Zero revenue mentioned — biggest blocker to next stage");

  // Customer evidence (interviews, users)
  if (signals.hasCustomers) { score += 15; whatWeSee.push("Customer proof present"); }
  else gaps.push("No customer interviews / users referenced");

  // Analytics / engagement
  if (signals.hasAnalytics) { score += 8; whatWeSee.push("Analytics in place"); }
  else gaps.push("No analytics connected — engagement is invisible to investors");

  // Tech development cadence
  if (signals.hasSourceCode) { score += 8; whatWeSee.push("Public/connected source code"); }

  // Partnerships
  if (hasAny(rawText, ["partner", "partnership", "channel", "integration with"])) {
    score += 8; whatWeSee.push("Partnership signals present");
  } else gaps.push("No partnership / distribution signal");

  // Stage progression itself (if SVI engine already moved them up)
  if ((analysis.stage ?? 0) >= 3) { score += 8; whatWeSee.push(`Already at ${analysis.stageLabel} stage`); }

  return {
    key: "progress",
    label: "Progress",
    question: "Are things happening fast? Customer interviews, users, revenue, engagement, partnerships, tech dev — all moving?",
    score: clamp(score),
    strength: strengthFromScore(score),
    whatWeSee: whatWeSee.slice(0, 5),
    gaps: gaps.slice(0, 5),
    howToLift: [
      "Log 10 customer-discovery calls this week and publish a one-page insights summary",
      "Connect Stripe / Xero so revenue updates feed the SVI engine in real time",
      "Sign 1 partnership / channel deal — even a co-marketing LOI counts",
    ],
    weight: 0.30,
  };
}

function scoreInvention({ signals, rawText, ci }: BuildArgs): AntlerSignal {
  const corpus = `${rawText} ${ci?.uniquePositioning ?? ""}`;
  let score = 20;
  const whatWeSee: string[] = [];
  const gaps: string[] = [];

  // Hard tech markers
  if (hasAny(corpus, ["patent", "patents", "ip protection", "trademark", "trade secret"])) {
    score += 25; whatWeSee.push("IP / patent signals present");
  } else gaps.push("No IP / patent / proprietary tech signal");

  if (hasAny(corpus, ["proprietary", "novel algorithm", "novel approach", "breakthrough", "research paper", "arxiv"])) {
    score += 15; whatWeSee.push("Proprietary / breakthrough tech language");
  }

  if (hasAny(corpus, ["llm", "transformer", "machine learning", "deep learning", "computer vision", "nlp", "ml model"])) {
    score += 12; whatWeSee.push("ML / AI invention angle");
  }

  if (hasAny(corpus, ["blockchain", "cryptography", "zero-knowledge", "smart contract"])) {
    score += 10; whatWeSee.push("Cryptography / blockchain angle");
  }

  if (signals.hasSourceCode) { score += 8; whatWeSee.push("Source code public/connected"); }

  if (ci?.industry?.toLowerCase().includes("deeptech") || ci?.industry?.toLowerCase().includes("ai")) {
    score += 10; whatWeSee.push("AI / deeptech sector classification");
  }

  if (!whatWeSee.some(s => /invention|patent|breakthrough|novel|proprietary|llm|ml/i.test(s))) {
    gaps.push("No 'invention' — looks like configuration of existing tech rather than a leap");
  }

  return {
    key: "invention",
    label: "Invention",
    question: "Have the founders invented new tech, or made a significant technical leap others haven't?",
    score: clamp(score),
    strength: strengthFromScore(score),
    whatWeSee: whatWeSee.slice(0, 5),
    gaps: gaps.slice(0, 5),
    howToLift: [
      "Publish a technical blog post explaining the invention / approach in plain English",
      "File a provisional patent if there's a defensible novel method",
      "Open-source the non-moat parts to attract contributor / customer attention",
    ],
    weight: 0.15,
  };
}

function scoreVision({ rawText, ci }: BuildArgs): AntlerSignal {
  const corpus = `${rawText} ${ci?.uniquePositioning ?? ""} ${ci?.targetCustomer ?? ""}`;
  let score = 30;
  const whatWeSee: string[] = [];
  const gaps: string[] = [];

  // Future-tense / scale language
  if (hasAny(corpus, ["future of", "next generation", "where the world is going", "what comes next", "category leader", "category creator"])) {
    score += 18; whatWeSee.push("Compelling future-state framing");
  } else gaps.push("No clearly articulated 'future of X' vision");

  // Scale and severity of the problem
  if (hasAny(corpus, ["billion dollar problem", "trillion", "millions of people", "every business", "every founder"])) {
    score += 12; whatWeSee.push("Problem scale framed at industry/global level");
  } else gaps.push("Problem scale / severity not framed in big-number terms");

  // Believable roadmap
  if (hasAny(corpus, ["roadmap", "year 1", "year 2", "year 3", "5-year plan", "phase 1", "milestones", "next 12 months"])) {
    score += 12; whatWeSee.push("Roadmap / phased plan referenced");
  } else gaps.push("No multi-year roadmap published");

  // Positioning clarity
  if (ci?.uniquePositioning && ci.uniquePositioning.length > 60) {
    score += 15; whatWeSee.push("AI-confirmed unique positioning detected");
  }

  // Market clarity (we already score this in SVI; reuse the signal)
  if (hasAny(corpus, ["clear", "obvious", "no-brainer"])) {
    score += 6; whatWeSee.push("Clarity language present in pitch");
  }

  return {
    key: "vision",
    label: "Unique Vision",
    question: "Do the founders see the future in a way others don't, and articulate scale, severity, and a believable roadmap?",
    score: clamp(score),
    strength: strengthFromScore(score),
    whatWeSee: whatWeSee.slice(0, 5),
    gaps: gaps.slice(0, 5),
    howToLift: [
      "Write a 'why now + what's coming' one-pager and pin it to the data room",
      "Frame the problem in TAM dollars and number-of-people-affected terms",
      "Publish a 12 / 36 / 60 month roadmap with measurable milestones",
    ],
    weight: 0.15,
  };
}

function scoreProduct10x({ signals, rawText, ci }: BuildArgs): AntlerSignal {
  const corpus = `${rawText} ${ci?.uniquePositioning ?? ""}`;
  let score = 25;
  const whatWeSee: string[] = [];
  const gaps: string[] = [];

  // Explicit 10x / faster / cheaper / easier language
  const dimensions: Array<[string, string[]]> = [
    ["speed",   ["10x faster", "100x faster", "instant", "real-time", "sub-second", "seconds vs", "minutes vs days"]],
    ["cost",    ["10x cheaper", "100x cheaper", "fraction of the cost", "90% cheaper", "free vs", "$X vs $Y"]],
    ["ease",    ["one click", "zero config", "no code", "self-serve", "no install", "60 seconds", "5 minutes"]],
    ["quality", ["benchmark", "accuracy", "state-of-the-art", "best-in-class", "industry-leading"]],
  ];
  for (const [dim, kws] of dimensions) {
    const hit = hasAny(corpus, kws);
    if (hit) {
      score += 12;
      whatWeSee.push(`10× on ${dim}: "${hit}"`);
    }
  }
  if (whatWeSee.length === 0) {
    gaps.push("No explicit 10× claim on any dimension (speed/cost/ease/quality)");
  }

  // Demo / product evidence reinforces the claim
  if (signals.hasDemo) { score += 10; whatWeSee.push("Demo / prototype available to back the claim"); }
  else if (whatWeSee.length > 0) gaps.push("Claim made but no demo to back it up");

  if (signals.hasProduct) { score += 5; whatWeSee.push("Product built"); }

  // Blue-ocean signal from CI
  if (ci && ci.blueOceanScore != null && ci.blueOceanScore >= 70) {
    score += 10; whatWeSee.push(`Blue-ocean score ${ci.blueOceanScore} — differentiated`);
  }

  return {
    key: "product_10x",
    label: "10× Product",
    question: "Is the product 10× better (not incrementally) on speed, cost, ease-of-use, or quality?",
    score: clamp(score),
    strength: strengthFromScore(score),
    whatWeSee: whatWeSee.slice(0, 5),
    gaps: gaps.slice(0, 5),
    howToLift: [
      "Pick ONE 10× dimension — bake it into the headline and demo",
      "Add a side-by-side comparison table (BlockID vs incumbent) to the homepage",
      "Ship a live benchmark / calculator showing the 10× claim in numbers",
    ],
    weight: 0.15,
  };
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export function evaluateAntlerSignals(args: BuildArgs): AntlerEvaluation {
  const signals = [
    scoreTeam(args),
    scoreProgress(args),
    scoreInvention(args),
    scoreVision(args),
    scoreProduct10x(args),
  ];

  const progressionScore = Math.round(
    signals.reduce((s, sig) => s + sig.score * sig.weight, 0) / signals.reduce((s, sig) => s + sig.weight, 0),
  );

  // Standout: highest score with weight >= 0.15
  const standout = [...signals].sort((a, b) => b.score - a.score)[0] ?? null;

  // Weakest link: lowest score in {progress, team} since those are >20% weight
  const heavyHitters = signals.filter((s) => s.weight >= 0.20);
  const weakestLink = heavyHitters.length > 0
    ? [...heavyHitters].sort((a, b) => a.score - b.score)[0]
    : null;

  const oneLine = progressionScore >= 80
    ? `Stage-progression readiness ${progressionScore}/100 — strong across the board; investors will see this as ready to level up.`
    : progressionScore >= 60
      ? `Stage-progression readiness ${progressionScore}/100 — meaningful momentum, but ${weakestLink?.label} is the gate. Close that and you progress.`
      : progressionScore >= 40
        ? `Stage-progression readiness ${progressionScore}/100 — early. Focus the next 60 days on ${weakestLink?.label} and ${signals.find((s) => s.key === "progress")?.score ?? 0 < 50 ? "shipping fast" : "evidence"}.`
        : `Stage-progression readiness ${progressionScore}/100 — pre-validation. Build the founder-problem narrative first, then move on Progress.`;

  return {
    signals,
    progressionScore,
    oneLine,
    standout,
    weakestLink,
    sourceNote: "Antler / Sequoia / a16z stage-progression heuristics. Scoring is deterministic — no LLM call. Lift any signal by completing the 'How to lift' actions and re-running the analysis.",
  };
}
