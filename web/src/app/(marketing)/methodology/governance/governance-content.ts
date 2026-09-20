/**
 * /methodology/governance content (G21 P0-D) — the machine-readable twin of
 * `docs/product/score-governance.md`.
 *
 * Pure. Every figure comes from the module the engine runs on: SVI_VERSION,
 * DIMENSION_OWNERS, EVIDENCE_CONFIDENCE, CAP_RULES_PLAIN, the verification
 * multiplier bounds, COHORT_MIN_N and BENCHMARK_N_RULES. The section titles
 * are pinned to the `## N. Title` headings of the markdown document by the
 * colocated test, so the public page and the institutional document cannot
 * drift apart. Weights are described, never listed (G14 F-3).
 */

import { COHORT_MIN_N } from "@/lib/agents/cohort-percentile";
import { CAP_RULES_PLAIN, CONFIDENCE_LEVELS } from "@/lib/evidence/confidence-cap";
import { DIMENSION_OWNERS, DIM_LEGACY_ORDER, DIM_ORDER } from "@/lib/report-pipeline/dimension-owners";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { EVIDENCE_CONFIDENCE, SVI_VERSION } from "@/lib/svi-analysis";
import { BENCHMARK_N_RULES } from "@/lib/svi/benchmark-rules";
import { VERIFICATION_MULTIPLIER_MAX, VERIFICATION_MULTIPLIER_MIN } from "@/lib/verification/confidence-multiplier";
import { agentLabel } from "../methodology-content";

export const GOVERNANCE_PATH = "/methodology/governance";
export const GOVERNANCE_VI_PATH = "/vi/methodology/governance";
export const GOVERNANCE_DOC_PATH = "docs/product/score-governance.md";

/** SVI_VERSION history — the last row must equal the live constant (test-pinned). */
export const SVI_VERSION_HISTORY: ReadonlyArray<{ version: string; date: string; change: string; type: "major" | "minor" | "initial" }> = Object.freeze([
  { version: "1.0.0", date: "2026-05-19", change: "First engine: single composite score from text input", type: "initial" },
  { version: "2.0.0", date: "2026-05-19", change: "Eight-dimension model, stage tracking, evidence wizard", type: "major" },
  { version: "2.1.0", date: "2026-08-16", change: "Funding-readiness gates; enhanced finance, strategy and data analysis prompts", type: "minor" },
  { version: "2.2.0", date: "2026-09-16", change: "Confidence cap by evidence origin; business-verification multiplier", type: "minor" },
]);

export interface GovernanceTable {
  columns: string[];
  rows: string[][];
}

export interface GovernanceSection {
  /** `s1` … `s14` — the anchor. */
  id: string;
  /** Exactly the markdown heading text after `## N. `. */
  title: string;
  paragraphs: string[];
  bullets?: string[];
  table?: GovernanceTable;
  /** Paragraphs rendered after the table / bullets. */
  after?: string[];
}

export interface GovernanceProps {
  version: string;
  docPath: string;
  hero: { eyebrow: string; title: string; subtitle: string };
  principle: string;
  sections: GovernanceSection[];
}

export const HUMAN_IN_THE_LOOP = "BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.";

const LENS: Record<string, string> = {
  chro: "People", cmo: "Marketing", cto: "Technology", cro: "Revenue", cfo: "Finance", clo: "Legal", ceo: "Strategy", cpo: "Product", cdo: "Data", coo: "Operations", ciso: "Security",
};

function weightRank(): { heaviest: string; lightest: string } {
  const sorted = [...DIM_ORDER].sort((a, b) => DIMENSION_OWNERS[b].weight - DIMENSION_OWNERS[a].weight);
  return { heaviest: DIMENSION_OWNERS[sorted[0]].title, lightest: DIMENSION_OWNERS[sorted[sorted.length - 1]].title };
}

const CAP_WHO: Record<string, string> = {
  self_declared: "founder text",
  public_url: "founder text that links a page BlockID can open",
  document_uploaded: "founder upload",
  connected_source: "connector (machine-read from the source of record)",
  transaction_data: "connector, for revenue and payouts",
  third_party_verified: "a named BlockID reviewer, after the founder requests review; audit-logged",
};

export function buildGovernanceSections(): GovernanceSection[] {
  const { heaviest, lightest } = weightRank();
  const capByOrigin = new Map(CAP_RULES_PLAIN.map((r) => [r.origin, r] as const));
  const cohortFloor = COHORT_MIN_N;

  return [
    {
      id: "s1",
      title: "Purpose and scope",
      paragraphs: [
        "The Startup Value Index (SVI) is a deterministic, evidence-weighted assessment of a company across eight business dimensions. It exists so that every company in a cohort, a pipeline or an index is assessed on the same framework, with the same evidence rules, at every point in time.",
        "This page is the governance contract for that score: what the dimensions mean, how weights and versions are managed, what the score may and may not claim, how conflicts between claims and evidence are handled, when humans intervene and how that intervention is recorded, and how the score is corrected and re-run.",
        "The score is information, not financial, legal or investment advice. Evaluators and founders make their own decisions.",
      ],
    },
    {
      id: "s2",
      title: "The eight dimensions",
      paragraphs: [
        "Each dimension is scored 0–100 from structured signals, then carries a weight, a confidence value, the evidence rows it rests on, the items that are missing, a benchmark position (when the benchmark rules allow one) and a next action. The names below are the engine's names.",
      ],
      table: {
        columns: ["Code", "Dimension", "What it measures", "Primary analytical lens"],
        rows: DIM_LEGACY_ORDER.map((key) => {
          const d = DIMENSION_OWNERS[key];
          return [key.toUpperCase(), d.title, d.promptCopy.streamDescription, `${LENS[d.primary] ?? d.primary} (${agentLabel(d.primary)})`];
        }),
      },
      after: [
        "Each dimension is assessed through a fixed set of evaluation criteria. A criterion that has no evidence is reported as pending, never scored as zero and never imputed.",
      ],
    },
    {
      id: "s3",
      title: "Weights",
      paragraphs: [],
      bullets: [
        "Weights are fixed per methodology version and sum to 100. The published table lives in the report pipeline (dimension-owners); the scoring engine carries the same values, and consolidating every copy onto that one table with a parity test is scheduled for the next methodology release. No report, pipeline or reviewer can change a weight at run time.",
        `The heaviest dimension is ${heaviest}; the lightest is ${lightest}. The full weight table is shown to authenticated evaluators inside every report and is not published on this page, so that the public rubric describes what is assessed rather than how to write to it.`,
        "Program-specific rubric weights (BlockID Cohort) re-aggregate the eight dimension scores for the displayed cohort score only; the underlying dimension scores and the canonical SVI are never altered by a program's weights, and both are stored.",
      ],
    },
    {
      id: "s4",
      title: "Evidence and confidence",
      paragraphs: ["Every signal that feeds a dimension carries an evidence level. The level sets the confidence multiplier applied to that signal:"],
      table: {
        columns: ["Level", "Confidence", "Who may set it"],
        rows: CONFIDENCE_LEVELS.map((level) => [level, (EVIDENCE_CONFIDENCE[level] ?? 0).toFixed(2), CAP_WHO[level] ?? ""]),
      },
      after: [
        `Caps are enforced by origin: ${capByOrigin.get("founder_text")?.who ?? "typed text"} cannot grade itself above ${capByOrigin.get("founder_text")?.ceiling ?? "public_url"}; ${capByOrigin.get("founder_upload")?.who ?? "an upload"} cannot post itself above ${capByOrigin.get("founder_upload")?.ceiling ?? "document_uploaded"}; a connector cannot exceed ${capByOrigin.get("connector")?.ceiling ?? "transaction_data"}; only a reviewer can set ${capByOrigin.get("reviewer")?.ceiling ?? "third_party_verified"}. Writing “audited” in a description changes nothing.`,
        `Business verification (L0 unverified to L5 continuous monitoring) applies a bounded multiplier to the confidence of the whole record (×${VERIFICATION_MULTIPLIER_MIN.toFixed(2)} at L0 to ×${VERIFICATION_MULTIPLIER_MAX.toFixed(2)} at L5), never above the next rung's ceiling and never above 1.0.`,
      ],
    },
    {
      id: "s5",
      title: "Versioning and version history",
      paragraphs: [
        `The methodology version (currently ${SVI_VERSION}) is stored on every snapshot and every report, together with the report-schema version and the pipeline version. A stored report keeps the versions it was produced with and is never silently re-scored by a newer rule set; a re-score is a new snapshot with the new version.`,
      ],
      table: {
        columns: ["Version", "Date", "Change", "Type"],
        rows: SVI_VERSION_HISTORY.map((h) => [h.version, h.date, h.change, h.type === "initial" ? "—" : h.type]),
      },
    },
    {
      id: "s6",
      title: "Change policy (semantic versioning)",
      paragraphs: [],
      table: {
        columns: ["Change", "Version step", "Notice"],
        rows: [
          ["Wording, narrative prompts, report layout", "patch", "changelog"],
          ["A weight, a criterion, an evidence-level value, a cap or multiplier", "minor", "changelog + this page's history table before deploy"],
          ["The set of dimensions, the score scale, or the benchmark rules", "major", "this page, /methodology, and every institutional customer notified in writing before deploy; both versions run side by side for one full cohort cycle"],
        ],
      },
      after: [
        "Every change is reviewed against the backtest before it ships. A change that improves agreement on the training cohort but worsens it on the held-out cohort does not ship.",
      ],
    },
    {
      id: "s7",
      title: "Benchmark publication rules",
      paragraphs: [
        "A benchmark compares a company with others at the same stage (and, when the sample allows, the same sector). Publication follows the sample size n of the comparison set:",
      ],
      table: {
        columns: ["n", "What may be shown"],
        rows: BENCHMARK_N_RULES.map((r) => [r.maxN === null ? `${r.minN} or more` : r.minN === 0 ? `fewer than ${r.maxN + 1}` : `${r.minN} – ${r.maxN}`, r.shows]),
      },
      after: [
        `n is always shown beside the figure. A national or sector “average” without its n is not permitted on any surface. Today the cohort-percentile module substitutes a band-based estimate labelled benchmark_fallback when a cohort has fewer than ${cohortFloor} companies; the tiered rules above replace that fallback as the Assessment Card ships (v3.19), after which nothing below n = 10 is shown as a percentile. Both are enforced in code, not copy.`,
      ],
    },
    {
      id: "s8",
      title: "Conflict handling — claim states",
      paragraphs: ["Every claim a company makes is stored separately from the evidence for it and carries one of five states (the claim register ships with the Assessment Card, v3.19; until then the report shows the evidence ladder level and the verification state per dimension):"],
      table: {
        columns: ["State", "Meaning", "Effect on the score"],
        rows: [
          ["claimed", "Stated by the founder; no evidence attached", "counts at self_declared confidence"],
          ["evidence-backed", "A document, link or connector supports the claim", "counts at the evidence's level"],
          ["verified", "A named reviewer confirmed the evidence against its source", "counts at third_party_verified"],
          ["unverified", "Evidence was requested or has expired and is not on file", "counts as a gap (pending), not as false"],
          ["conflicting", "Two sources disagree (for example, a stated revenue figure and connected transaction data)", "the higher-confidence value is used for the score, the lower-confidence value is kept on the record, and the conflict is shown on the report with both figures"],
        ],
      },
      after: [
        "Conflicts are never averaged and never hidden. A conflicting claim is flagged to the founder with the evidence that would resolve it; while it is open, the dimension's confidence reflects the disagreement.",
      ],
    },
    {
      id: "s9",
      title: "Human review and overrides",
      paragraphs: [],
      bullets: [
        "Reviewer decisions (marking evidence third_party_verified, rejecting an upload) are made by a named BlockID reviewer, only after the founder requests review, and are written to the append-only, hash-chained audit log with the reviewer, the time and the reason.",
        "Evaluator decisions (pass, track, proceed, with conviction and private notes) are recorded per evaluator per company and are separate from the score; they never change the SVI.",
        "Overrides of a score or a dimension inside a cohort view (BlockID Cohort, v3.20) are recorded as an override row: original value, new value, who, when and why. The canonical score is unchanged; the cohort view shows both and labels the override. An override is never silent and never retroactive. Until the cohort override row ships, evaluators record disagreement as a decision with private notes, which never changes the score.",
        "Automation never decides. The engine produces the assessment; the program's committee, the investor or the founder makes the decision and records it.",
      ],
    },
    {
      id: "s10",
      title: "Corrections and appeals",
      paragraphs: [],
      bullets: [
        "A founder (or an evaluator with access) flags a specific item — a score input, an evidence row, a benchmark, a narrative statement — from the report.",
        "The flag is logged (item, reporter, time, reason) and acknowledged.",
        "BlockID checks the item against its evidence. If the input or the evidence handling was wrong, it is corrected at the source and a new report version is produced with the new version and snapshot; the old version is kept.",
        "If the item is a genuine gap, the founder is told which evidence closes it, and a re-score follows once it is supplied.",
        "Outcomes are recorded on the audit log. Corrections that reveal a rule defect are handled under the change policy.",
      ],
      after: ["Appeals about a program's decision go to the program; BlockID can only correct the assessment, not the decision."],
    },
    {
      id: "s11",
      title: "Re-score policy",
      paragraphs: [],
      bullets: [
        "A re-score happens when evidence is added, verified, expires or is corrected; on the scheduled daily snapshot for tracked companies; or when the methodology version changes.",
        "Each re-score writes a new snapshot; the history is kept so movement over time is real movement, not a rule change. When the version changes, the report states the version of every snapshot it compares.",
        "Cohort batches are scored on one version; a batch is never mixed across versions.",
      ],
    },
    {
      id: "s12",
      title: "Model provenance",
      paragraphs: [
        "The deterministic score never touches a language model. Narrative chapters do, and every run records the model that produced each chapter plus an auditor stamp: whether the text is grounded in the evidence rows, how many statements went uncited, and whether the auditor revised it.",
        "Models are routed by availability and cost and can change between runs; the record of which one ran does not. BlockID makes no claim that any vendor's model is better than another's.",
      ],
    },
    {
      id: "s13",
      title: "Data limitations",
      paragraphs: [],
      bullets: [
        "The assessment reflects the evidence on file at the time of the snapshot. Missing evidence is reported as pending, not inferred.",
        "Self-declared inputs carry low confidence by design; a company that supplies only prose will show a low-confidence score, not a low score.",
        "Benchmarks depend on the size and composition of the comparison set. Early cohorts and rare sectors will show “indicative” or no percentile.",
        "Outcome calibration is a backtest on a curated Australian cohort; it is published with n and confidence intervals, and it does not forecast an individual company.",
        "Connectors read what the source of record exposes; they do not audit it. third_party_verified is the only state that involves a human check against the source.",
      ],
    },
    {
      id: "s14",
      title: "Contact",
      paragraphs: [
        `Questions about this page, requests for the weight table under an evaluator agreement, and correction requests: ${LEGAL_ENTITY.supportEmail}. Institutional customers receive written notice of every major change.`,
      ],
    },
  ];
}

export function buildGovernanceProps(): GovernanceProps {
  return {
    version: SVI_VERSION,
    docPath: GOVERNANCE_DOC_PATH,
    hero: {
      eyebrow: "Methodology · Governance",
      title: "Startup Value Index — score governance",
      subtitle: `The rules methodology version ${SVI_VERSION} follows: dimensions, weights, versioning, benchmarks, conflicts, human review, corrections and re-scores — written for program managers, investment committees and their auditors.`,
    },
    principle: HUMAN_IN_THE_LOOP,
    sections: buildGovernanceSections(),
  };
}
