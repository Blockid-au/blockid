// demo-cohort-shared — the FICTIONAL demo cohort for buyer demos (G24-C;
// docs/plans/g24-report-readability-demo-cohort-2026-09-21.md § 2 C).
//
// PURE and client-safe: no Supabase, no "server-only", no AI. The five
// startups below are invented — the names are compound coinages chosen so
// they cannot collide with a real Australian company, they carry no ABN, and
// every one ends in "(demo)". Their scores are derived deterministically
// from the demo evidence register (lib/report-v2/fixtures.ts, the same
// register /tbr/demo renders): a startup "holds" a subset of the register's
// evidenced rows, its dimension scores scale the register's dimension
// scores by how much of each dimension that subset covers, and its evidence
// confidence follows the coverage and its verification level (L1–L5 spread).
// One startup carries a conflicting claim, one a stale connector, so the
// risk flags, the compare drawer and the report all have something to show.
//
// The DB layer (creating / removing the batch) is ./demo-cohort.ts; the
// labels the surfaces render come from the i18n catalogue through
// `demoCohortLabels()` so EN and VI stay in step.

import type { Messages } from "@/lib/i18n/t";
import { DIMENSION_KEYS, type DimensionKey } from "./batch-shared";

/** The batch name every demo cohort is created with (the chip, not the name, is the label). */
export const DEMO_COHORT_NAME = "Demo cohort";
export const DEMO_COHORT_PROGRAM_NAME = "Workflow demo (fictional data)";
/** Slug prefix on every demo project — the reverse lookup key for the fixture. */
export const DEMO_PROJECT_SLUG_PREFIX = "demo-cohort-";

export type DemoStaleConnector = "xero" | "stripe" | "ga4" | "github";

export interface DemoStartupFixture {
  /** Stable key (slug suffix). */
  key: string;
  /** Display name — always ends in "(demo)". */
  name: string;
  /** projects.industry (free text, the same values the CSV import writes). */
  industry: string;
  state: "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "ACT" | "NT";
  /** projects.stage 0..7. */
  stage: number;
  /** projects.verification_level 1..5 — the L1–L5 spread. */
  verificationLevel: 1 | 2 | 3 | 4 | 5;
  /** Register evidence ids this startup holds (subset of the demo register's evidenced rows). */
  evidenceIds: readonly string[];
  /** Per-dimension nudge so the five profiles differ (team-heavy, traction-heavy, …). */
  offsets: Partial<Record<DimensionKey, number>>;
  /** One startup carries a conflicting claim (the risk flag + compare drawer). */
  conflictingClaims: number;
  /** One startup carries a connector whose proof has expired. */
  staleConnector: DemoStaleConnector | null;
  /** One-line founder blurb for the project description (fictional). */
  description: string;
}

/**
 * The five fictional startups. Coinages only ("Wattlebyte", "Coralwind",
 * "Pelicanpay", "Brolgafield", "Emberquay") — none is a registered AU
 * business name at the time of writing and none carries an ABN.
 */
export const DEMO_STARTUPS: readonly DemoStartupFixture[] = Object.freeze([
  {
    key: "wattlebyte",
    name: "Wattlebyte Compliance (demo)",
    industry: "SaaS",
    state: "NSW",
    stage: 4,
    verificationLevel: 5,
    evidenceIds: ["ev-connected-revenue-stripe", "ev-connected-xero-pnl", "ev-connected-ga4-acquisition", "ev-market-anchor-abs", "ev-hub-data-room", "ev-cap-table-demo", "ev-tech-audit-demo", "ev-hub-lco-ip-assignment"],
    offsets: { ftv: 2, tre: 3, svm: -4 },
    conflictingClaims: 0,
    staleConnector: null,
    description: "Fictional SME compliance SaaS with connected Stripe, Xero and GA4 — the fully evidenced reference profile.",
  },
  {
    key: "coralwind",
    name: "Coralwind Health (demo)",
    industry: "Healthtech",
    state: "QLD",
    stage: 3,
    verificationLevel: 3,
    evidenceIds: ["ev-connected-revenue-stripe", "ev-connected-xero-pnl", "ev-hub-data-room", "ev-cap-table-demo"],
    offsets: { ptd: 6, mpc: -3, lco: -6 },
    conflictingClaims: 0,
    staleConnector: "xero",
    description: "Fictional allied-health scheduling platform; the Xero connector last synced 97 days ago, so its P&L proof has expired.",
  },
  {
    key: "pelicanpay",
    name: "Pelicanpay Ledger (demo)",
    industry: "Fintech",
    state: "VIC",
    stage: 4,
    verificationLevel: 2,
    evidenceIds: ["ev-connected-revenue-stripe", "ev-connected-ga4-acquisition", "ev-tech-audit-demo"],
    offsets: { tre: 5, cgh: -8, iri: -5 },
    conflictingClaims: 1,
    staleConnector: null,
    description: "Fictional SME payments ledger; the deck claims A$180k MRR while Stripe shows A$100k — a conflicting claim the committee must resolve.",
  },
  {
    key: "brolgafield",
    name: "Brolgafield Agsense (demo)",
    industry: "Agtech",
    state: "SA",
    stage: 2,
    verificationLevel: 4,
    evidenceIds: ["ev-market-anchor-abs", "ev-hub-data-room", "ev-cap-table-demo", "ev-tech-audit-demo", "ev-hub-lco-ip-assignment"],
    offsets: { lco: 4, tre: -12, mpc: 2 },
    conflictingClaims: 0,
    staleConnector: null,
    description: "Fictional soil-moisture sensor network at validation stage; strong IP and governance, pre-revenue.",
  },
  {
    key: "emberquay",
    name: "Emberquay Climate (demo)",
    industry: "Climate tech",
    state: "WA",
    stage: 1,
    verificationLevel: 1,
    evidenceIds: ["ev-market-anchor-abs"],
    offsets: { svm: 4, ftv: -6, tre: -20, iri: -10 },
    conflictingClaims: 0,
    staleConnector: null,
    description: "Fictional bushfire-risk data startup at idea stage — self-declared only, the thinnest evidence profile in the cohort.",
  },
]);

export const DEMO_COHORT_SIZE = DEMO_STARTUPS.length;

/** The suffix every exported artefact (Cohort Report, demo-day pack, CSV filename) carries for a demo cohort. */
export const DEMO_EXPORT_SUFFIX = " — Demo data (fictional)";

/** Pure: the cohort name as exports print it — labelled when the batch is the demo. */
export function exportCohortName(batch: { name: string; isDemo?: boolean }): string {
  return batch.isDemo ? `${batch.name}${DEMO_EXPORT_SUFFIX}` : batch.name;
}

/** `demo-cohort-<key>` — the slug the demo project is created with (a numeric suffix may follow on collision). */
export function demoProjectSlug(key: string): string {
  return `${DEMO_PROJECT_SLUG_PREFIX}${key}`;
}

/** Pure: the fixture behind a demo project slug (`demo-cohort-<key>` or `demo-cohort-<key>-2`); null for anything else. */
export function demoStartupForSlug(slug: string | null | undefined): DemoStartupFixture | null {
  if (!slug || !slug.startsWith(DEMO_PROJECT_SLUG_PREFIX)) return null;
  const rest = slug.slice(DEMO_PROJECT_SLUG_PREFIX.length);
  for (const s of DEMO_STARTUPS) {
    if (rest === s.key || rest.startsWith(`${s.key}-`)) return s;
  }
  return null;
}

// ─── Scoring from the register ──────────────────────────────────────────────

/** The slice of the demo register the scorer reads (lib/report-v2/fixtures `demoSnapshotInput()` fits it). */
export interface DemoRegisterInput {
  /** The register's dimension scores (`dimStates[k].score`). */
  dims: Partial<Record<DimensionKey, number>>;
  /** The register's evidence rows — `status: "evidenced"` rows are the pool a startup can hold. */
  evidenceRows: ReadonlyArray<{ evidence_id: string; dims: readonly string[]; status: string; confidence?: string | null; label?: string }>;
}

export interface DemoEvidenceRow {
  dimension: DimensionKey;
  evidence_type: string;
  confidence_level: string | null;
}

export interface DemoCohortItem {
  fixture: DemoStartupFixture;
  dimensionScores: Record<DimensionKey, number>;
  /** Plain mean of the 8 dimensions (integer) — the cohort's SVI column. */
  sviTotal: number;
  /** 0–100 evidence confidence (coverage × verification level). */
  evidenceConfidence: number;
  /** Journey evidence rows (dimension × catalogue code × confidence rung) — the completion % per startup. */
  evidence: DemoEvidenceRow[];
  conflictingClaims: number;
  staleConnector: DemoStaleConnector | null;
  /** The evaluator-private note the evaluations row carries. */
  notes: string;
}

const MIN_DIM = 5;
const MAX_DIM = 98;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Catalogue codes per dimension, in the order the register's coverage
 * "unlocks" them — kept here (not imported from svi-completeness) so this
 * module stays a leaf the client bundle can carry.
 */
const CATALOG_CODES: Record<DimensionKey, readonly string[]> = {
  ftv: ["founder_linkedin", "founder_bio", "asic_founder_history", "advisor_bios"],
  mpc: ["problem_statement", "market_research", "market_benchmarks", "customer_interviews"],
  ptd: ["website", "tech_architecture", "github_repo", "product_demo_video"],
  tre: ["revenue_proof", "mrr_dashboard", "churn_rate", "customer_list"],
  cgh: ["cap_table_spreadsheet", "vesting_schedule", "shareholder_agreement", "esop_pool"],
  iri: ["pitch_deck", "financial_model", "data_room", "investor_1pager"],
  lco: ["abn_registration", "ip_assignment", "terms_of_service", "ip_searches"],
  svm: ["vision_statement", "moat_analysis", "data_advantage", "network_effect"],
};

/**
 * Pure and deterministic: the five demo items from the register. Every
 * number is a function of the register + the fixture, so the same register
 * always produces the same cohort (the unit test pins the numbers).
 */
export function buildDemoCohortItems(register: DemoRegisterInput, startups: readonly DemoStartupFixture[] = DEMO_STARTUPS): DemoCohortItem[] {
  const evidenced = register.evidenceRows.filter((r) => r.status === "evidenced");
  const poolByDim: Record<DimensionKey, number> = Object.fromEntries(DIMENSION_KEYS.map((k) => [k, evidenced.filter((r) => r.dims.includes(k)).length])) as Record<DimensionKey, number>;

  return startups.map((fixture) => {
    const held = evidenced.filter((r) => fixture.evidenceIds.includes(r.evidence_id));
    const dimensionScores = {} as Record<DimensionKey, number>;
    const evidence: DemoEvidenceRow[] = [];
    let coverageSum = 0;
    for (const k of DIMENSION_KEYS) {
      const rows = held.filter((r) => r.dims.includes(k));
      // A dimension no register row evidences (the demo register has no
      // founder rows — both FTV rows are `missing`) falls back to the
      // startup's verification level, so the profile still spreads.
      const coverage = poolByDim[k] > 0 ? rows.length / poolByDim[k] : fixture.verificationLevel / 5;
      coverageSum += coverage;
      const base = register.dims[k] ?? 50;
      dimensionScores[k] = clamp(Math.round(base * (0.6 + 0.4 * coverage) + (fixture.offsets[k] ?? 0)), MIN_DIM, MAX_DIM);
      rows.forEach((r, i) => {
        const code = CATALOG_CODES[k][i];
        if (code) evidence.push({ dimension: k, evidence_type: code, confidence_level: r.confidence ?? null });
      });
    }
    const coverageAvg = coverageSum / DIMENSION_KEYS.length;
    const sviTotal = Math.round(DIMENSION_KEYS.reduce((a, k) => a + dimensionScores[k], 0) / DIMENSION_KEYS.length);
    const evidenceConfidence = clamp(Math.round(15 + 55 * coverageAvg + 5 * fixture.verificationLevel), 0, 100);
    const notes = [
      "Demo data — fictional. This startup was generated for the workflow demo; remove the demo cohort before real applicants arrive.",
      fixture.conflictingClaims > 0 ? "Conflicting claim: the deck's revenue figure does not match the connected Stripe read." : null,
      fixture.staleConnector ? `Stale connector: ${fixture.staleConnector} last synced 97 days ago — its proof has expired.` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return { fixture, dimensionScores, sviTotal, evidenceConfidence, evidence, conflictingClaims: fixture.conflictingClaims, staleConnector: fixture.staleConnector, notes };
  });
}

// ─── Labels (EN / VI through the catalogue) ─────────────────────────────────

export interface DemoCohortLabels {
  chip: string;
  chipTitle: string;
  load: string;
  loading: string;
  importCsv: string;
  bannerTitle: string;
  bannerBody: string;
  remove: string;
  removeConfirm: string;
  removed: string;
  cancel: string;
  error: string;
  emptyHint: string;
}

export const DEMO_COHORT_LABEL_KEYS: Record<keyof DemoCohortLabels, string> = {
  chip: "demoCohort.chip",
  chipTitle: "demoCohort.chipTitle",
  load: "demoCohort.load",
  loading: "demoCohort.loading",
  importCsv: "demoCohort.importCsv",
  bannerTitle: "demoCohort.banner.title",
  bannerBody: "demoCohort.banner.body",
  remove: "demoCohort.remove",
  removeConfirm: "demoCohort.removeConfirm",
  removed: "demoCohort.removed",
  cancel: "demoCohort.cancel",
  error: "demoCohort.error",
  emptyHint: "demoCohort.emptyHint",
};

/** The EN copy — the fallback when a catalogue is not to hand (client components render this by default). */
export const DEMO_COHORT_LABELS_EN: DemoCohortLabels = Object.freeze({
  chip: "Demo data — fictional",
  chipTitle: "An invented startup generated for the workflow demo. Not a real company; no ABN; excluded from benchmarks and the Startup Index.",
  load: "Load a demo cohort",
  loading: "Loading the demo cohort…",
  importCsv: "Import CSV",
  bannerTitle: "Demo data — fictional",
  bannerBody: "These five startups are invented so you can run the whole cohort workflow — filters, compare, overrides, snapshots, the Cohort Report, the demo-day pack and feedback letters — before real applicants arrive. Nothing here reaches benchmarks, the Startup Index, calibration, your organisation's export or the institutional API.",
  remove: "Remove demo cohort",
  removeConfirm: "Remove the demo cohort and its five fictional startups? Your real cohorts are untouched.",
  removed: "Demo cohort removed.",
  cancel: "Cancel",
  error: "Could not load the demo cohort. Please try again.",
  emptyHint: "Not ready to import? Load the fictional five and try every step first.",
});

/**
 * Pick the demo labels from a catalogue (EN keys resolve through `t()`'s EN
 * fallback, so a missing VI key still reads in English). Pure.
 */
export function demoCohortLabels(local: Messages, en: Messages = local): DemoCohortLabels {
  const out = { ...DEMO_COHORT_LABELS_EN } as DemoCohortLabels;
  for (const k of Object.keys(DEMO_COHORT_LABEL_KEYS) as Array<keyof DemoCohortLabels>) {
    const key = DEMO_COHORT_LABEL_KEYS[k];
    const v = local[key] ?? en[key];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}
