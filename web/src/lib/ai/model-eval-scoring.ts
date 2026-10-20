// A2 (pricing v5 §7.4, G35) — pure scoring for the model eval loop.
//
// `scoreModelCase(profile, case, run)` turns one model answer into a
// CaseScore against its task profile; `aggregateCaseScores` rolls a task ×
// model's cases into the scorecard row (aggregate + detail: per section /
// chapter, per language, p95, schema-fail rate, cost per accepted output).
//
// Checks reuse the production gates instead of re-inventing them:
//   • groundedShare  — eval-runner `groundedShareOf` (marker / declared
//                      estimate per material claim) AND llm-auditor
//                      `findUncitedClaims` with the evidence rows as citable
//                      sources (a cited id must hold every figure);
//   • invented figure — auto-cite `numericTokens` / `itemHasNumber`;
//   • fabricated citation — any [ev:<id>] / citations[] id not offered.
//
// No fs, no network, no clock.

import { z } from "zod";
import { groundedShareOf, type FixtureCase } from "./eval-runner";
import { findUncitedClaims } from "@/lib/report-pipeline/llm-auditor";
import { itemHasNumber, numericTokens, type CitableItem } from "@/lib/report-pipeline/auto-cite";
import { EVAL_TASK_IDS, type EvalCandidate, type EvalLang, type EvalTaskId, type TaskProfile } from "./task-profiles";

// ── Fixture schema ───────────────────────────────────────────────────

export const ExpectedSpec = z.object({
  /** Verbatim substrings that must appear (figures, markers, brand names). */
  must_keep: z.array(z.string().min(1)).default([]),
  /** At least one must appear (case-insensitive). */
  must_mention_any: z.array(z.string().min(1)).default([]),
  /** None may appear (case-insensitive) — a hit is a CRITICAL error. */
  must_not_mention: z.array(z.string().min(1)).default([]),
  /** Distinct offered evidence ids the answer must cite. */
  min_citations: z.number().int().nonnegative().optional(),
  /** extraction: expected field values (null = the document does not say it). */
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  /** classify: expected labels. */
  label: z.object({ sector: z.string(), stage: z.string() }).optional(),
  /** grounding_judge: claim id → supported? */
  claim_labels: z.record(z.string(), z.boolean()).optional(),
  /** grounding_judge: claims carrying an invented figure — judging one "supported" is CRITICAL. */
  critical_claims: z.array(z.string()).default([]),
  /** vision: bar label → value (± tol). */
  values: z.array(z.object({ label: z.string().min(1), value: z.number(), tol: z.number().nonnegative().default(0) })).optional(),
});
export type ExpectedSpec = z.infer<typeof ExpectedSpec>;

export const ModelEvalCase = z.object({
  id: z.string().min(1).max(80),
  lang: z.enum(["en", "vi"]),
  /** Report chapter / section / topic — the scorecard's per-section detail key. */
  section: z.string().min(1).max(60).default("general"),
  input: z.record(z.string(), z.unknown()),
  expected: ExpectedSpec.default({ must_keep: [], must_mention_any: [], must_not_mention: [], critical_claims: [] }),
});
export type ModelEvalCase = z.infer<typeof ModelEvalCase>;

export const ModelEvalFixture = z.object({
  task: z.enum(EVAL_TASK_IDS),
  split: z.enum(["dev", "heldout"]),
  version: z.string().min(1),
  /** Provenance — synthetic / public only (the repo is public). */
  source: z.string().min(1),
  cases: z.array(ModelEvalCase).min(1),
});
export type ModelEvalFixture = z.infer<typeof ModelEvalFixture>;

// ── Run + score shapes ───────────────────────────────────────────────

export interface ModelRunOutcome {
  ok: boolean;
  text: string;
  latencyMs: number;
  costUsd: number;
  error?: string;
}

export interface CaseScore {
  caseId: string;
  lang: EvalLang;
  section: string;
  /** Transport answered with content. */
  ok: boolean;
  schemaOk: boolean;
  /** Critical error reasons (fabricated citation, forbidden content, fabricated field, judged an invented figure supported). */
  critical: string[];
  groundedShare: number | null;
  /** null = no numeric check for this task / case. */
  numericOk: boolean | null;
  /** 0..1 deterministic quality (0 on transport / schema / critical failure). */
  quality: number;
  accepted: boolean;
  latencyMs: number;
  costUsd: number;
  /** Different-family judge score 0..1 when this case was sampled and judged. */
  judgeScore?: number | null;
  error?: string;
}

/** An accepted output also needs this much deterministic quality. */
export const ACCEPT_QUALITY_FLOOR = 0.6;

// ── JSON parsing ─────────────────────────────────────────────────────

/** Lenient JSON object extraction: fenced block, whole text, or first {…last}. Null when none parses. */
export function parseModelJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const tries: string[] = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1]!);
  tries.push(text.trim());
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch { /* next */ }
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────

const EV_ID_RE = /\[ev:([^\]]+)\]/gi;

interface EvidenceRow { id: string; label?: string; text: string }

function evidenceOf(input: Record<string, unknown>): EvidenceRow[] {
  const raw = input["evidence"];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .map((r) => ({ id: String(r["id"] ?? ""), label: typeof r["label"] === "string" ? r["label"] : undefined, text: String(r["text"] ?? "") }))
    .filter((r) => r.id);
}

const lc = (s: string) => s.toLowerCase();
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function citedIds(text: string): string[] {
  return Array.from(text.matchAll(EV_ID_RE), (m) => m[1]!.trim());
}

/** Material-claim texts of a chapter / synthesis payload (cards carry their citations as markers). */
function claimTexts(task: EvalTaskId, data: Record<string, unknown>): string[] {
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  if (task === "report_chapter") {
    const cards = Array.isArray(data["criterion_cards"]) ? (data["criterion_cards"] as Array<Record<string, unknown>>) : [];
    return [
      ...(typeof data["verdict"] === "string" ? [data["verdict"]] : []),
      ...strs(data["strengths"]),
      ...strs(data["gaps"]),
      ...cards.map((c) => `${typeof c?.["verdict"] === "string" ? c["verdict"] : ""} ${strs(c?.["citations"]).map((id) => `[ev:${id}]`).join(" ")}`.trim()),
    ];
  }
  if (task === "ceo_synthesis") {
    return [
      ...(typeof data["headline"] === "string" ? [data["headline"]] : []),
      ...(typeof data["summary"] === "string" ? [data["summary"]] : []),
      ...strs(data["top_risks"]),
      ...strs(data["next_steps"]),
    ];
  }
  return [];
}

/**
 * Grounded share of a chapter / synthesis answer: min(marker share via
 * eval-runner groundedShareOf, 1 − flagged / claims via llm-auditor
 * findUncitedClaims with the evidence as citable sources). Null without evidence.
 */
export function evalGroundedShare(task: EvalTaskId, input: Record<string, unknown>, data: Record<string, unknown>): number | null {
  const evidence = evidenceOf(input);
  if (evidence.length === 0) return null;
  const claims = claimTexts(task, data).filter((c) => c.trim());
  if (claims.length === 0) return 0;
  const ids = evidence.map((e) => e.id);
  const citable: CitableItem[] = evidence.map((e) => ({ id: e.id, label: e.label ?? e.id, text: e.text }));
  let flagged = 0;
  for (const c of claims) if (findUncitedClaims(c, ids, 1, citable).length > 0) flagged += 1;
  const auditorShare = 1 - flagged / claims.length;
  let markerShare = auditorShare;
  if (task === "report_chapter") {
    const fx = { id: "x", name: "x", input: { evidenceRows: evidence }, expected: { must_have_gaps: [], must_not_hallucinate: [] } } as unknown as FixtureCase;
    markerShare = groundedShareOf(fx, data) ?? auditorShare;
  }
  return round3(Math.min(markerShare, auditorShare));
}

/** Strong figures in `text` that no evidence row holds (invented numbers). */
export function inventedFigures(text: string, evidence: readonly EvidenceRow[]): string[] {
  const out: string[] = [];
  for (const tok of numericTokens(text.replace(EV_ID_RE, " "))) {
    if (!tok.strong) continue;
    if (!evidence.some((e) => itemHasNumber(e.text, tok))) out.push(tok.raw.trim());
  }
  return [...new Set(out)];
}

function numEq(got: unknown, want: number, tolFrac = 0.01): boolean {
  const n = typeof got === "number" ? got : typeof got === "string" ? Number(got.replace(/[^0-9.-]/g, "")) : NaN;
  if (!Number.isFinite(n)) return false;
  return Math.abs(n - want) <= Math.max(Math.abs(want) * tolFrac, 1e-9);
}

// ── Scoring ──────────────────────────────────────────────────────────

function failScore(c: ModelEvalCase, run: ModelRunOutcome, ok: boolean, error: string): CaseScore {
  return {
    caseId: c.id, lang: c.lang, section: c.section, ok, schemaOk: false, critical: [], groundedShare: null, numericOk: null,
    quality: 0, accepted: false, latencyMs: run.latencyMs, costUsd: run.costUsd, error,
  };
}

/** Score one answer against its profile + case. Never throws. */
export function scoreModelCase(profile: TaskProfile, c: ModelEvalCase, run: ModelRunOutcome): CaseScore {
  if (!run.ok || !run.text?.trim()) return failScore(c, run, false, run.error ?? "empty response");
  const data = parseModelJson(run.text);
  if (!data) return failScore(c, run, true, "not JSON");
  const parsed = profile.outputSchema.safeParse(data);
  if (!parsed.success) return failScore(c, run, true, `schema: ${parsed.error.issues[0]?.path.join(".") ?? ""} ${parsed.error.issues[0]?.message ?? ""}`.trim());
  const out = parsed.data as Record<string, unknown>;
  const e = c.expected;
  const serialised = JSON.stringify(out);
  const hay = lc(serialised);
  const critical: string[] = [];
  const parts: number[] = [];
  let groundedShare: number | null = null;
  let numericOk: boolean | null = null;

  for (const bad of e.must_not_mention) if (hay.includes(lc(bad))) critical.push(`forbidden: ${bad}`);
  if (e.must_keep.length) parts.push(e.must_keep.filter((k) => serialised.includes(k) || hay.includes(lc(k))).length / e.must_keep.length);
  if (e.must_mention_any.length) parts.push(e.must_mention_any.some((m) => hay.includes(lc(m))) ? 1 : 0);

  const evidence = evidenceOf(c.input);
  const offered = new Set(evidence.map((r) => lc(r.id)));

  switch (profile.id) {
    case "report_chapter":
    case "ceo_synthesis": {
      const cards = Array.isArray(out["criterion_cards"]) ? (out["criterion_cards"] as Array<{ citations?: string[] }>) : [];
      const ids = [...citedIds(serialised), ...cards.flatMap((k) => k.citations ?? [])];
      for (const id of new Set(ids)) if (!offered.has(lc(id))) critical.push(`fabricated_citation: ${id}`);
      groundedShare = evalGroundedShare(profile.id, c.input, out);
      if (groundedShare !== null) parts.push(groundedShare);
      const invented = inventedFigures(claimTexts(profile.id, out).join("\n"), evidence);
      numericOk = invented.length === 0;
      parts.push(numericOk ? 1 : 0);
      if (typeof e.min_citations === "number") {
        const distinct = new Set(ids.map(lc).filter((id) => offered.has(id)));
        parts.push(distinct.size >= e.min_citations ? 1 : distinct.size / Math.max(1, e.min_citations));
      }
      break;
    }
    case "grounding_judge": {
      const labels = e.claim_labels ?? {};
      const verdicts = new Map(((out["verdicts"] as Array<{ id: string; supported: boolean }>) ?? []).map((v) => [v.id, v.supported]));
      const ids = Object.keys(labels);
      const correct = ids.filter((id) => verdicts.get(id) === labels[id]).length;
      parts.push(ids.length ? correct / ids.length : 0);
      for (const id of e.critical_claims) if (verdicts.get(id) === true) critical.push(`passed_invented_figure: ${id}`);
      numericOk = e.critical_claims.every((id) => verdicts.get(id) === false);
      break;
    }
    case "extraction": {
      const fields = e.fields ?? {};
      const keys = Object.keys(fields);
      let hit = 0;
      let numericAll = true;
      for (const k of keys) {
        const want = fields[k];
        const got = out[k];
        let match = false;
        if (want === null) {
          match = got === null || got === undefined;
          if (!match) critical.push(`fabricated_field: ${k}`);
        } else if (typeof want === "number") {
          match = numEq(got, want);
          if (!match) numericAll = false;
        } else {
          match = typeof got === "string" && (lc(got).includes(lc(want)) || lc(want).includes(lc(got)));
        }
        if (match) hit += 1;
      }
      parts.push(keys.length ? hit / keys.length : 0);
      numericOk = numericAll;
      break;
    }
    case "classify": {
      const want = e.label;
      if (want) parts.push((out["sector"] === want.sector ? 0.6 : 0) + (out["stage"] === want.stage ? 0.4 : 0));
      break;
    }
    case "translation": {
      const src = String(c.input["text"] ?? "");
      const tr = String(out["translation"] ?? "");
      const srcIds = new Set(citedIds(src).map(lc));
      for (const id of citedIds(tr)) if (!srcIds.has(lc(id))) critical.push(`fabricated_citation: ${id}`);
      const figures = e.must_keep.filter((k) => /\d/.test(k));
      numericOk = figures.every((k) => tr.includes(k));
      const ratio = src.length ? tr.length / src.length : 0;
      parts.push(ratio >= 0.5 && ratio <= 2.2 ? 1 : 0);
      break;
    }
    case "chat": {
      const figures = e.must_keep.filter((k) => /\d/.test(k));
      numericOk = figures.length ? figures.every((k) => serialised.includes(k)) : null;
      break;
    }
    case "vision": {
      const want = e.values ?? [];
      const got = (out["values"] as Array<{ label: string; value: number }>) ?? [];
      const byLabel = new Map(got.map((v) => [lc(v.label.trim()), v.value]));
      const hit = want.filter((w) => {
        const v = byLabel.get(lc(w.label));
        return typeof v === "number" && Math.abs(v - w.value) <= w.tol + 1e-9;
      }).length;
      parts.push(want.length ? hit / want.length : 0);
      numericOk = want.length > 0 && hit === want.length;
      break;
    }
  }

  const quality = critical.length > 0 ? 0 : round3(parts.length ? mean(parts) : 1);
  const minG = profile.criteria.minGroundedShare;
  const accepted =
    critical.length === 0 &&
    quality >= ACCEPT_QUALITY_FLOOR &&
    (minG === null || groundedShare === null || groundedShare >= minG) &&
    (!profile.criteria.numericCheck || numericOk !== false) &&
    run.costUsd <= profile.criteria.maxCostUsdPerOutput;
  return { caseId: c.id, lang: c.lang, section: c.section, ok: true, schemaOk: true, critical, groundedShare, numericOk, quality, accepted, latencyMs: run.latencyMs, costUsd: run.costUsd };
}

// ── Aggregation ──────────────────────────────────────────────────────

export interface SliceStats {
  n: number;
  quality: number;
  acceptRate: number;
  schemaFailRate: number;
  groundedShare: number | null;
}

export interface TaskModelScore {
  task: EvalTaskId;
  provider: string;
  model: string;
  family: string;
  billing: "paid" | "free";
  tier: EvalCandidate["tier"];
  n: number;
  transportFails: number;
  /** Transport failures caused by the eval's own load (429 / rate limit / timeout / overload / cap) — never evidence a model is dead. */
  transientFails: number;
  schemaFails: number;
  /** Schema failures ÷ answered cases (transport failures excluded — that is "dead", not "schema"). */
  schemaFailRate: number;
  criticalErrors: number;
  accepted: number;
  acceptRate: number;
  /** Mean deterministic quality over ALL cases (a transport failure scores 0). */
  quality: number;
  groundedShare: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  costUsd: number;
  /** USD ÷ accepted outputs; null when nothing was accepted. */
  costPerAccepted: number | null;
  judge: { n: number; mean: number | null };
  byLanguage: Partial<Record<EvalLang, SliceStats>>;
  bySection: Record<string, SliceStats>;
  /** Passes every profile gate (0 critical, schema fail ≤ max, p95 ≤ ceiling, cost/accepted ≤ ceiling, grounded ≥ min). */
  passesProfile: boolean;
  failReasons: string[];
  /** Every call failed in transport (n ≥ 3) with a DEFINITIVE error (404 / not found / decommissioned …), none transient. */
  dead: boolean;
}

/** Rate limits, timeouts and overloads of the eval's own calls are inconclusive, not a dead model. */
export const TRANSIENT_FAILURE_RE = /\b(429|500|502|503|504)\b|rate.?limit|too many requests|quota|time[d ]?out|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|abort|overload|busy|capacity|call cap|budget|refused|not configured|empty content/i;

export function isTransientFailure(error: string | undefined): boolean {
  return !error || TRANSIENT_FAILURE_RE.test(error);
}

/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.min(s.length, Math.max(1, Math.ceil((p / 100) * s.length)));
  return s[rank - 1]!;
}

function slice(scores: CaseScore[]): SliceStats {
  const answered = scores.filter((s) => s.ok);
  const g = scores.map((s) => s.groundedShare).filter((x): x is number => typeof x === "number");
  return {
    n: scores.length,
    quality: round3(mean(scores.map((s) => s.quality))),
    acceptRate: round3(scores.length ? scores.filter((s) => s.accepted).length / scores.length : 0),
    schemaFailRate: round3(answered.length ? answered.filter((s) => !s.schemaOk).length / answered.length : 0),
    groundedShare: g.length ? round3(mean(g)) : null,
  };
}

export function aggregateCaseScores(profile: TaskProfile, candidate: EvalCandidate, scores: CaseScore[]): TaskModelScore {
  const answered = scores.filter((s) => s.ok);
  const lat = answered.map((s) => s.latencyMs);
  const cost = scores.reduce((s, c) => s + c.costUsd, 0);
  const accepted = scores.filter((s) => s.accepted).length;
  const judged = scores.map((s) => s.judgeScore).filter((x): x is number => typeof x === "number");
  const base = slice(scores);
  const byLanguage: Partial<Record<EvalLang, SliceStats>> = {};
  for (const lang of ["en", "vi"] as const) {
    const sub = scores.filter((s) => s.lang === lang);
    if (sub.length) byLanguage[lang] = slice(sub);
  }
  const bySection: Record<string, SliceStats> = {};
  for (const sec of [...new Set(scores.map((s) => s.section))].sort()) bySection[sec] = slice(scores.filter((s) => s.section === sec));
  const criticalErrors = scores.reduce((s, c) => s + c.critical.length, 0);
  const p95 = percentile(lat, 95);
  const costPerAccepted = accepted > 0 ? Math.round((cost / accepted) * 1e8) / 1e8 : null;
  const failed = scores.filter((s) => !s.ok);
  const transientFails = failed.filter((s) => isTransientFailure(s.error)).length;
  const dead = scores.length >= 3 && answered.length === 0 && transientFails === 0;
  const failReasons: string[] = [];
  if (scores.length === 0) failReasons.push("no cases");
  if (dead) failReasons.push("dead (no answer)");
  if (criticalErrors > 0) failReasons.push(`${criticalErrors} critical error(s)`);
  if (base.schemaFailRate > profile.criteria.maxSchemaFailRate) failReasons.push(`schema fail ${Math.round(base.schemaFailRate * 100)}% > ${Math.round(profile.criteria.maxSchemaFailRate * 100)}%`);
  if (p95 !== null && p95 > profile.criteria.p95LatencyMs) failReasons.push(`p95 ${Math.round(p95 / 1000)}s > ${Math.round(profile.criteria.p95LatencyMs / 1000)}s`);
  if (accepted === 0 && scores.length > 0) failReasons.push("no accepted output");
  if (costPerAccepted !== null && costPerAccepted > profile.criteria.maxCostUsdPerOutput) failReasons.push(`cost/accepted US$${costPerAccepted.toFixed(4)} > US$${profile.criteria.maxCostUsdPerOutput}`);
  if (profile.criteria.minGroundedShare !== null && base.groundedShare !== null && base.groundedShare < profile.criteria.minGroundedShare) failReasons.push(`grounded ${base.groundedShare} < ${profile.criteria.minGroundedShare}`);
  return {
    task: profile.id,
    provider: candidate.provider,
    model: candidate.model,
    family: candidate.family,
    billing: candidate.billing,
    tier: candidate.tier,
    n: scores.length,
    transportFails: scores.length - answered.length,
    transientFails,
    schemaFails: answered.filter((s) => !s.schemaOk).length,
    schemaFailRate: base.schemaFailRate,
    criticalErrors,
    accepted,
    acceptRate: base.acceptRate,
    quality: base.quality,
    groundedShare: base.groundedShare,
    p50LatencyMs: percentile(lat, 50),
    p95LatencyMs: p95,
    costUsd: Math.round(cost * 1e8) / 1e8,
    costPerAccepted,
    judge: { n: judged.length, mean: judged.length ? round3(mean(judged)) : null },
    byLanguage,
    bySection,
    passesProfile: failReasons.length === 0,
    failReasons,
    dead,
  };
}
