// Startup Package — deliverable registry.
//
// Central mapping between the founder-facing "auto-fill this deliverable"
// buttons on the Package dashboard and (a) which PDF generator to invoke,
// (b) how to build the generator's `data` prop from what we know about the
// project, (c) which dataroom folder to file it under, (d) the credit key
// that gates it, and (e) the canonical template_slug used to insert the
// dataroom_files row.
//
// This module is pure data + pure helpers — no server-only imports — so it
// is safe to reference from client components (e.g. to render the price
// label before the founder clicks). The heavy PDF work happens in the
// server route `/api/startup-package/deliverable/[slug]` which imports the
// PDF generators lazily.
//
// SUBGOAL 7 (spawn-agent-v-d-ng-cosmic-aho plan).

import type { FeatureCostKey } from "./deliverable-registry-types";

// ── Types ─────────────────────────────────────────────────────────────────

/** Growth-phase id string — matches ids in `lib/startup-growth-phases.ts`. */
export type GrowthPhaseId =
  | "vision"
  | "customer_dev"
  | "revenue_model"
  | "pitch"
  | "mentor_review"
  | "legal_equity"
  | "go_to_market"
  | "product_dev"
  | "investor_review"
  | "team"
  | "growth"
  | "funding";

/** Which PDF generator to invoke on the server. */
export type PdfGenerator =
  | "pitch-deck"
  | "investor-pack"
  | "founder-pack"
  | "valuation-report"
  | "svi-report";

/**
 * Inputs handed to every {@link DeliverableEntry.inputBuilder}. Kept
 * intentionally loose (`unknown` for the SVI + project rows) so the
 * registry has zero runtime dependency on lib/svi-analysis or lib/projects,
 * which would tug it into the server-only world.
 */
export interface DeliverableInputContext {
  /** Row from `projects` — expected to include `name` at minimum. */
  project: {
    id: string;
    name: string;
    slug?: string | null;
    description?: string | null;
    industry?: string | null;
  };
  /** All rows from `startup_package_interview` for the project, oldest first. */
  interviewAnswers: Array<{
    step_key: string;
    answer_text: string;
    char_count?: number | null;
  }>;
  /** Latest `svi_snapshots.analysis_json` (may be null on brand-new projects). */
  sviAnalysis: {
    totalSVI?: number;
    grade?: string;
    stage?: number;
    stageLabel?: string;
    dimensionScores?: Record<string, number>;
    summary?: string;
    signals?: Record<string, unknown>;
  } | null;
  /** Founder email — needed by some PDFs for the "prepared for" line. */
  founderEmail?: string;
  /** Founder display name — used when the PDF renders a "prepared for" tag. */
  founderName?: string;
  /** Absolute URL to the /startup/[slug] listing — passed to Founder Pack. */
  shareUrl?: string;
}

export interface DeliverableEntry {
  /** URL-safe slug — matches the route param `/api/startup-package/deliverable/[slug]`. */
  key: string;
  /** Growth-phase this deliverable belongs to. */
  phaseId: GrowthPhaseId;
  /** Human-readable card label. */
  label: string;
  /** One-line explanation shown under the label. */
  blurb: string;
  /** PDF generator dispatched on success. */
  pdfGenerator: PdfGenerator;
  /** `FEATURE_COSTS` key — drives cost + `canAfford/spendCredits`. */
  featureKey: FeatureCostKey;
  /** dataroom folder / `dataroom_files.svi_dimension` bucket. */
  dataroomFolder: string;
  /** Canonical template_slug pattern — `package_<phase>_<key>`. */
  templateSlug: string;
  /**
   * Build the props payload passed to the matching PDF generator. Kept
   * returning `unknown` because each generator's data shape is different;
   * the server dispatch validates by generator kind before render.
   */
  inputBuilder: (ctx: DeliverableInputContext) => unknown;
}

// ── Shared helpers used by input builders ─────────────────────────────────

function firstAnswer(
  ctx: DeliverableInputContext,
  keys: string[],
  fallback: string,
): string {
  for (const key of keys) {
    const hit = ctx.interviewAnswers.find((a) => a.step_key === key);
    if (hit?.answer_text && hit.answer_text.trim().length > 0) {
      return hit.answer_text.trim();
    }
  }
  return fallback;
}

function joinAnswers(ctx: DeliverableInputContext, keys: string[]): string {
  return keys
    .map((k) => firstAnswer(ctx, [k], ""))
    .filter((s) => s.length > 0)
    .join("\n\n");
}

function sviGrade(ctx: DeliverableInputContext): string {
  if (ctx.sviAnalysis?.grade) return ctx.sviAnalysis.grade;
  const score = ctx.sviAnalysis?.totalSVI;
  if (typeof score !== "number") return "—";
  if (score >= 150) return "A";
  if (score >= 130) return "B";
  if (score >= 110) return "C";
  return "D";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureSvi13(
  ctx: DeliverableInputContext,
): Array<{ id: string; label: string; score: number; delta?: number }> {
  // Investor Pack expects the 13-criteria list; fall back to dimension scores
  // when the newer 13-crit map isn't populated on the snapshot.
  const dim = ctx.sviAnalysis?.dimensionScores ?? {};
  const rows: Array<{ id: string; label: string; score: number }> = [];
  for (const [id, score] of Object.entries(dim)) {
    if (typeof score === "number") {
      rows.push({ id, label: id, score });
    }
  }
  if (rows.length === 0) {
    // Deterministic zero-row so the PDF renders instead of crashing.
    rows.push({ id: "overall", label: "Overall", score: ctx.sviAnalysis?.totalSVI ?? 0 });
  }
  return rows;
}

// ── Registry ──────────────────────────────────────────────────────────────

const REGISTRY: DeliverableEntry[] = [
  // ── vision ──────────────────────────────────────────────────────────────
  {
    key: "pitch_deck",
    phaseId: "vision",
    label: "Auto-fill Pitch Deck",
    blurb: "12-slide investor deck seeded from your interview answers.",
    pdfGenerator: "pitch-deck",
    featureKey: "pitch_deck",
    dataroomFolder: "pitch",
    templateSlug: "package_vision_pitch_deck",
    inputBuilder: (_ctx) => ({
      // The PitchDeckPDF component takes no props in Ship 1 — content is
      // driven off the BlockID reference deck. Founder-specific slides
      // will be layered in Ship 2.
    }),
  },
  {
    key: "vision_report",
    phaseId: "vision",
    label: "Vision & Mission SVI report",
    blurb: "Cover page + Vision/Mission section of your live SVI report.",
    pdfGenerator: "svi-report",
    featureKey: "svi_report",
    dataroomFolder: "strategy",
    templateSlug: "package_vision_svi_report",
    inputBuilder: (ctx) => ({
      analysis: ctx.sviAnalysis ?? { version: "2.0.0", totalSVI: 100, baselineSVI: 100 },
      startupName: ctx.project.name,
      email: ctx.founderEmail,
      tier: "standard" as const,
      reportDate: todayIso(),
    }),
  },

  // ── customer_dev ────────────────────────────────────────────────────────
  {
    key: "customer_pack",
    phaseId: "customer_dev",
    label: "Customer discovery pack",
    blurb: "Persona + top pains + interview digest as a founder-pack PDF.",
    pdfGenerator: "founder-pack",
    featureKey: "svi_report",
    dataroomFolder: "customer",
    templateSlug: "package_customer_dev_customer_pack",
    inputBuilder: (ctx) => ({
      pack: buildFounderPackShape(ctx, {
        section: "customer_dev",
        headline: "Customer discovery",
        body: joinAnswers(ctx, ["cd_persona", "cd_pains", "cd_channels"]),
      }),
      shareUrl: ctx.shareUrl ?? "",
    }),
  },

  // ── revenue_model ───────────────────────────────────────────────────────
  {
    key: "valuation_report",
    phaseId: "revenue_model",
    label: "Preliminary valuation report",
    blurb: "Multi-method valuation range from your revenue-model inputs.",
    pdfGenerator: "valuation-report",
    featureKey: "valuation_detailed",
    dataroomFolder: "financial",
    templateSlug: "package_revenue_model_valuation_report",
    inputBuilder: (ctx) => ({
      report: buildValuationStub(ctx),
      email: ctx.founderEmail,
    }),
  },

  // ── pitch ───────────────────────────────────────────────────────────────
  {
    key: "investor_pack",
    phaseId: "pitch",
    label: "Investor pack (one-pager)",
    blurb: "Teaser + SVI grade + cap-table snapshot in a single PDF.",
    pdfGenerator: "investor-pack",
    featureKey: "svi_report",
    dataroomFolder: "investor",
    templateSlug: "package_pitch_investor_pack",
    inputBuilder: (ctx) => ({
      startup: {
        name: ctx.project.name,
        tagline: ctx.project.description ?? "",
        sector: ctx.project.industry ?? "startup",
        asOfDate: todayIso(),
      },
      svi: {
        grade: sviGrade(ctx),
        score: ctx.sviAnalysis?.totalSVI ?? 0,
        criteria: ensureSvi13(ctx),
      },
      teaser: {
        headline: firstAnswer(ctx, ["vision_headline", "pitch_headline"], ctx.project.name),
        oneliner: firstAnswer(ctx, ["pitch_oneliner", "vision"], ""),
        opportunity: firstAnswer(ctx, ["pitch_opportunity"], ""),
        risk: firstAnswer(ctx, ["pitch_risk"], ""),
      },
    }),
  },

  // ── legal_equity ────────────────────────────────────────────────────────
  {
    key: "founder_pack",
    phaseId: "legal_equity",
    label: "Founder pack — equity + legal",
    blurb: "Equity split, vesting, SHA highlights, cap-table shell.",
    pdfGenerator: "founder-pack",
    featureKey: "svi_report",
    dataroomFolder: "legal",
    templateSlug: "package_legal_equity_founder_pack",
    inputBuilder: (ctx) => ({
      pack: buildFounderPackShape(ctx, {
        section: "legal_equity",
        headline: "Founder pack",
        body: joinAnswers(ctx, ["le_structure", "le_sha", "le_ip", "le_captable"]),
      }),
      shareUrl: ctx.shareUrl ?? "",
    }),
  },

  // ── go_to_market ────────────────────────────────────────────────────────
  {
    key: "gtm_playbook",
    phaseId: "go_to_market",
    label: "GTM playbook",
    blurb: "Channels, launch plan, marketing budget — Founder Pack style.",
    pdfGenerator: "founder-pack",
    featureKey: "svi_report",
    dataroomFolder: "gtm",
    templateSlug: "package_go_to_market_gtm_playbook",
    inputBuilder: (ctx) => ({
      pack: buildFounderPackShape(ctx, {
        section: "go_to_market",
        headline: "Go-to-market playbook",
        body: joinAnswers(ctx, ["gtm_strategy", "gtm_channels", "gtm_budget"]),
      }),
      shareUrl: ctx.shareUrl ?? "",
    }),
  },

  // ── investor_review ─────────────────────────────────────────────────────
  {
    key: "investor_review",
    phaseId: "investor_review",
    label: "Investor-review packet",
    blurb: "The one-pager tightened for a review meeting.",
    pdfGenerator: "investor-pack",
    featureKey: "svi_report",
    dataroomFolder: "investor",
    templateSlug: "package_investor_review_investor_review",
    inputBuilder: (ctx) => ({
      startup: {
        name: ctx.project.name,
        tagline: ctx.project.description ?? "",
        sector: ctx.project.industry ?? "startup",
        asOfDate: todayIso(),
      },
      svi: {
        grade: sviGrade(ctx),
        score: ctx.sviAnalysis?.totalSVI ?? 0,
        criteria: ensureSvi13(ctx),
      },
      teaser: {
        headline: firstAnswer(ctx, ["ir_headline", "vision_headline"], ctx.project.name),
        oneliner: firstAnswer(ctx, ["ir_oneliner", "pitch_oneliner"], ""),
      },
    }),
  },

  // ── funding ─────────────────────────────────────────────────────────────
  {
    key: "funding_report",
    phaseId: "funding",
    label: "Fundraising SVI report",
    blurb: "Full 13-criteria SVI report tailored for the round.",
    pdfGenerator: "svi-report",
    featureKey: "svi_report",
    dataroomFolder: "funding",
    templateSlug: "package_funding_funding_report",
    inputBuilder: (ctx) => ({
      analysis: ctx.sviAnalysis ?? { version: "2.0.0", totalSVI: 100, baselineSVI: 100 },
      startupName: ctx.project.name,
      email: ctx.founderEmail,
      tier: "premium" as const,
      reportDate: todayIso(),
    }),
  },
];

const REGISTRY_BY_KEY: Map<string, DeliverableEntry> = new Map(
  REGISTRY.map((entry) => [entry.key, entry]),
);

export function getDeliverable(key: string): DeliverableEntry | null {
  return REGISTRY_BY_KEY.get(key) ?? null;
}

export function deliverablesForPhase(phaseId: GrowthPhaseId): DeliverableEntry[] {
  return REGISTRY.filter((entry) => entry.phaseId === phaseId);
}

export function allDeliverables(): DeliverableEntry[] {
  return [...REGISTRY];
}

// ── Shared shape builders (used by more than one entry) ───────────────────

interface FounderPackShapeInput {
  section: string;
  headline: string;
  body: string;
}

/**
 * Minimal Founder Pack payload — matches `FounderPackPdfData.pack` well
 * enough for @react-pdf/renderer to render without crashing on missing
 * numeric fields. The full production pack is generated by
 * `lib/founder-pack/hydrate.ts`; Ship 1 auto-fill only needs a summary.
 */
function buildFounderPackShape(
  ctx: DeliverableInputContext,
  input: FounderPackShapeInput,
): {
  createdAt: string;
  ideaName: string;
  user: { displayName: string | null; email: string };
  evaluation: { ideaName: string; summary: string } | null;
  split: null;
  funding: null;
  section: string;
  headline: string;
  body: string;
} {
  return {
    createdAt: new Date().toISOString(),
    ideaName: ctx.project.name,
    user: {
      displayName: ctx.founderName ?? null,
      email: ctx.founderEmail ?? "",
    },
    evaluation: {
      ideaName: ctx.project.name,
      summary: input.body || (ctx.sviAnalysis?.summary ?? ""),
    },
    split: null,
    funding: null,
    section: input.section,
    headline: input.headline,
    body: input.body,
  };
}

function buildValuationStub(ctx: DeliverableInputContext): {
  companyName: string;
  currency: string;
  methods: Array<{ name: string; low: number; base: number; high: number }>;
  summary: string;
} {
  // Deterministic conservative stub — the CFO valuation agent will overwrite
  // this in Ship 2 when the full data pipeline is wired.
  const baseline = Math.max(500_000, (ctx.sviAnalysis?.totalSVI ?? 100) * 5_000);
  return {
    companyName: ctx.project.name,
    currency: "AUD",
    methods: [
      { name: "Berkus", low: baseline * 0.6, base: baseline, high: baseline * 1.4 },
      { name: "Scorecard", low: baseline * 0.7, base: baseline * 1.1, high: baseline * 1.5 },
      { name: "VC method", low: baseline * 0.8, base: baseline * 1.2, high: baseline * 1.8 },
    ],
    summary:
      ctx.sviAnalysis?.summary ??
      `Preliminary valuation seeded from the current SVI score for ${ctx.project.name}. Refine after the CFO agent pass.`,
  };
}
