import { CRITERIA } from "@/lib/evaluation-criteria";
import { isReportV2, type ReportV2, type CriterionCard, type DimensionChapter } from "@/lib/report-v2/schema";
import { legacyStreamDimMeta, type DimKey } from "./dimension-owners";
import type { LegacyDimResult, CriterionResult } from "./run-report-pipeline";

const LEGACY_META = legacyStreamDimMeta();

export function legacyLabel(dim: DimKey): string {
  return LEGACY_META[dim]?.label ?? dim.toUpperCase();
}

export function priorityForScore(score: number): "high" | "medium" | "low" {
  return score < 50 ? "high" : score < 70 ? "medium" : "low";
}

/** Chapter → the ≤ 300-word markdown block the legacy card renders (strengths / gaps / next step). */
export function chapterToMarkdown(chapter: DimensionChapter): string {
  const lines = [chapter.verdict.trim(), ""];
  lines.push("**Strengths (with evidence):**", ...(chapter.strengths.length ? chapter.strengths.map((s) => `- ${s}`) : ["- none evidenced yet"]), "");
  lines.push("**Gaps (what's missing or unverifiable):**", ...(chapter.gaps.length ? chapter.gaps.map((g) => `- ${g}`) : ["- none identified"]), "");
  const na = chapter.nextAction;
  lines.push("**Next Step (concrete, this-week action):**", `- ${na.title} (${na.window.replace(/_/g, " ")}, expected lift +${na.expectedLift})`);
  if (chapter.scoreNote) lines.push("", `*${chapter.scoreNote}*`);
  if (chapter.degraded) lines.push("", `*Deterministic card — ${chapter.degradeReason ?? "owner call unavailable"}.*`);
  return lines.join("\n");
}

const clip = (s: string, words: number) => {
  const w = s.trim().split(/\s+/).filter(Boolean);
  return w.length <= words ? w.join(" ") : `${w.slice(0, words).join(" ")}…`;
};

export function chapterToLegacy(chapter: DimensionChapter): LegacyDimResult {
  // G19-S43: chapter bullets no longer repeat the criterion cards', so the
  // Wave-24 card's two insights fall back to the first card's own bullets.
  const cardStrength = chapter.criteria.flatMap((c) => c.strengths).find(Boolean);
  const cardGap = chapter.criteria.flatMap((c) => c.gaps).find(Boolean);
  const insights = [chapter.strengths[0] ?? cardStrength, chapter.gaps[0] ?? cardGap].filter((s): s is string => Boolean(s)).map((s) => clip(s.replace(/\s*\[(?:ev:[^\]]*|unevidenced)\]/g, ""), 15));
  const b = chapter.benchmark;
  return {
    dimension: chapter.dim,
    label: legacyLabel(chapter.dim),
    score: chapter.score,
    markdown: chapterToMarkdown(chapter),
    insights: insights.length ? insights : ["Analysis complete — see the chapter"],
    priority: priorityForScore(chapter.score),
    market_benchmark: `Stage ${b.stage} cohort: p25 ${b.p25} · p50 ${b.p50} · p75 ${b.p75}${typeof b.percentile === "number" ? ` — you sit at the ${b.percentile}th percentile` : ""} (svi-dimension-benchmarks ANCHORS; sector cohort when N ≥ 30)`,
  };
}

export function cardToLegacy(card: CriterionCard): CriterionResult {
  const def = CRITERIA.find((c) => c.key === card.key);
  return {
    key: card.key,
    title: card.title || def?.title || card.key,
    primary_dimension: def?.primaryDimension ?? "tre",
    weight: def?.weight ?? 0,
    score: card.score,
    verdict: card.verdict,
    strengths: card.strengths.slice(0, 2),
    gaps: card.gaps.slice(0, 2),
    next_action: card.nextAction,
    quality: card.quality,
    citations: card.citations,
  };
}

// ── Event translation (pure, tested) ────────────────────────────────────────


export interface FinalProjection {
  version: 1;
  scope: "full" | "partial";
  reportId: string;
  totalSVI: number | null;
  dimensions: LegacyDimResult[];
  criteria: CriterionResult[];
}
/** A display projection of this generated document, not a durable save receipt. */
export function projectFinalReport(report: ReportV2, reportId: string, dims?: DimKey[]): FinalProjection | null {
  if (!isReportV2(report)) return null;
  const chapters = report.dimensions.filter(d => !dims || dims.includes(d.dim));
  const cards = new Map<string, CriterionCard>();
  for (const chapter of chapters) for (const card of chapter.criteria) if (!cards.has(card.key)) cards.set(card.key, card);
  return { version: 1, scope: dims ? "partial" : "full", reportId, totalSVI: dims ? null : report.cover.svi.total,
    dimensions: chapters.map(chapterToLegacy), criteria: CRITERIA.flatMap(c => cards.has(c.key) ? [cardToLegacy(cards.get(c.key)!)] : []) };
}
/** Bounded validation for JSON replay. Canonical producer validation happens above. */
export function readFinalProjection(value: unknown): FinalProjection | null {
  if (!value || typeof value !== "object") return null;
  const p = value as FinalProjection;
  if (p.version !== 1 || !["full", "partial"].includes(p.scope) || typeof p.reportId !== "string" || !p.reportId ||
      (p.totalSVI !== null && (!Number.isFinite(p.totalSVI) || p.totalSVI < 0)) || !Array.isArray(p.dimensions) || !Array.isArray(p.criteria)) return null;
  if ((p.scope === "full" && (p.dimensions.length !== 8 || p.totalSVI === null)) || (p.scope === "partial" && p.totalSVI !== null)) return null;
  if (!p.dimensions.every(d => d && typeof d === "object")) return null;
  if (p.dimensions.length > 8 || !p.dimensions.length || p.criteria.length > 13 || new Set(p.dimensions.map(d => d.dimension)).size !== p.dimensions.length) return null;
  if (!p.dimensions.every(d => d && Object.hasOwn(LEGACY_META, d.dimension) && Number.isFinite(d.score) && typeof d.markdown === "string" && typeof d.label === "string" && Array.isArray(d.insights) && d.insights.every(i => typeof i === "string") && ["high", "medium", "low"].includes(d.priority))) return null;
  if (!p.criteria.every(c => c && CRITERIA.some(def => def.key === c.key) && Number.isFinite(c.score) && typeof c.verdict === "string" && typeof c.title === "string" && typeof c.next_action === "string" && Array.isArray(c.strengths) && c.strengths.every(v => typeof v === "string") && Array.isArray(c.gaps) && c.gaps.every(v => typeof v === "string"))) return null;
  return p;
}
/** Selected-dimension retries replace only their affected criterion cards. */
export function mergeFinalCriteria<T extends { key: string }>(previous: T[], incoming: T[], scope: "full" | "partial"): T[] {
  if (scope === "full") return incoming;
  const replacements = new Map(incoming.map(c => [c.key, c]));
  return [...previous.map(c => replacements.get(c.key) ?? c), ...incoming.filter(c => !previous.some(old => old.key === c.key))];
}

/** Preserve UI expansion and untouched retry dimensions while replacing results. */
export function replaceFinalDimensions<T extends object>(previous: Record<string, T>, projection: FinalProjection): Record<string, T> {
  const next = { ...previous };
  for (const d of projection.dimensions) next[d.dimension] = { ...next[d.dimension], status: "complete", score: d.score, markdown: d.markdown,
    insights: d.insights, priority: d.priority, marketBenchmark: d.market_benchmark ?? null, errorMsg: null } as T;
  return next;
}

/** Partial documents may contain adapter fallback dimensions. Use only the
 * orchestrator's post-gate selected chapters, never those fallback guesses. */
export function projectFinalSelectedChapters(chapters: DimensionChapter[] | undefined, reportId: string, dims: DimKey[]): FinalProjection | null {
  if (!chapters) return null;
  const selected = chapters.filter(chapter => dims.includes(chapter.dim));
  if (selected.length !== dims.length || new Set(selected.map(c => c.dim)).size !== dims.length) return null;
  const cards = new Map<string, CriterionCard>();
  for (const chapter of selected) for (const card of chapter.criteria) if (!cards.has(card.key)) cards.set(card.key, card);
  return readFinalProjection({ version: 1, scope: "partial", reportId, totalSVI: null,
    dimensions: selected.map(chapterToLegacy), criteria: CRITERIA.flatMap(c => cards.has(c.key) ? [cardToLegacy(cards.get(c.key)!)] : []) });
}
