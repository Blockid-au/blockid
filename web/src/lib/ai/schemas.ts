/**
 * Canonical Zod contracts for LLM output — v3 Master Upgrade Plan §6.2.
 *
 * Every structured AI response the platform accepts is validated against
 * one of these schemas by web/src/lib/ai/call-structured.ts. The prompt
 * registry (0230_prompt_versions.output_schema) serialises the same
 * shapes to JSON so the machine-readable contract stays in one place.
 *
 * Design rules baked in here:
 *   - Every claim carries at least one citation
 *   - Citations are (evidence_id, verbatim quote) tuples — the report
 *     renderer cross-checks the evidence_id against ai_runs.evidence_ids
 *   - `hallucination_risk` and `severity` are closed enums
 *   - `proposed_score` is clamped to 0..100 (SVI convention)
 *   - `confidence` is clamped to 0..1 (model self-reported)
 *   - `area_id` is limited to the 12 §6 evaluation areas
 */

import { z } from "zod";

// ── §6 evaluation matrix — the twelve analysis areas ──────────────────
//
// These identifiers match the master evaluation matrix used by the SVI
// engine and by every downstream report. Adding an area is a schema
// change; renaming one is a breaking change for every prompt version.
export const AreaEnum = z.enum([
  "identity",
  "governance",
  "financials",
  "product",
  "traction",
  "market",
  "team",
  "tech",
  "risk",
  "ip",
  "compliance",
  "esg",
]);
export type Area = z.infer<typeof AreaEnum>;

// ── Citation — the atomic reference every claim must carry ───────────
//
// evidence_id: uuid of the evidence_extractions row (or the parent
//   evidence row) that supports this claim.
// quote: the verbatim excerpt the model relied on. Must be non-empty so
//   the report renderer can display a source snippet next to the claim.
export const Citation = z.object({
  evidence_id: z.string().uuid(),
  quote: z.string().min(1),
});
export type Citation = z.infer<typeof Citation>;

// ── 30/60/90 action item ─────────────────────────────────────────────
//
// Every assessment finding carries a small set of concrete next-steps
// bucketed by the 30/60/90 day horizon so the founder-facing report can
// render an actionable timeline.
export const Action30_60_90 = z.object({
  window: z.enum(["30d", "60d", "90d"]),
  title: z.string().min(1),
  effort: z.enum(["low", "medium", "high"]),
  owner: z.string().min(1),
});
export type Action30_60_90 = z.infer<typeof Action30_60_90>;

// ── AssessmentFinding — one graded observation about one §6 area ─────
//
// Emitted by AIR-004..AIR-006 (assessor agents). The orchestrator
// aggregates findings across areas into the final SVI score.
export const AssessmentFinding = z.object({
  area_id: AreaEnum,
  title: z.string().min(1),
  detail: z.string().min(1),
  proposed_score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  hallucination_risk: z.enum(["low", "medium", "high"]),
  citations: z.array(Citation).min(1),
  actions: z.array(Action30_60_90).default([]),
});
export type AssessmentFinding = z.infer<typeof AssessmentFinding>;

// ── RiskFinding — a graded risk observation ──────────────────────────
//
// Emitted by AIR-007 (risk agent). Distinct from AssessmentFinding
// because risks carry likelihood/impact + a mitigation plan rather than
// a score-nudging observation.
export const RiskFinding = z.object({
  area_id: AreaEnum,
  title: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  likelihood: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
  mitigation: z.string().min(1),
  confidence: z.number().min(0).max(1),
  hallucination_risk: z.enum(["low", "medium", "high"]),
  citations: z.array(Citation).min(1),
});
export type RiskFinding = z.infer<typeof RiskFinding>;

// ── EvidenceExtraction — one structured fact pulled from a source ────
//
// Emitted by AIR-002 (evidence classifier). Persisted to
// evidence_extractions and cited by downstream assessment agents.
export const EvidenceExtraction = z.object({
  area_id: AreaEnum,
  fact: z.string().min(1),
  raw_snippet: z.string().min(1),
  confidence: z.number().min(0).max(1),
  hallucination_risk: z.enum(["low", "medium", "high"]),
  evidence_id: z.string().uuid(),
});
export type EvidenceExtraction = z.infer<typeof EvidenceExtraction>;

// ── ReportSection — one prose section of the final Trust Report ──────
//
// Emitted by AIR-009 (section assembler). The orchestrator concatenates
// sections into the final rendered report. Every prose paragraph must
// be backed by citations so the auditor (§5.4 llm-auditor) can flag
// fabricated specifics.
export const ReportSection = z.object({
  area_id: AreaEnum,
  heading: z.string().min(1),
  body_markdown: z.string().min(1),
  citations: z.array(Citation).min(1),
  confidence: z.number().min(0).max(1),
  hallucination_risk: z.enum(["low", "medium", "high"]),
});
export type ReportSection = z.infer<typeof ReportSection>;
