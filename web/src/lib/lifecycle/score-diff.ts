// G34-BT4 EM12 — pure score-diff helpers for the "score updated" e-mail.
// No I/O and no server-only import: lib/svi/rescore-from-evidence.ts (used
// by the evidence route and the connector-resync cron) computes the diff
// with the analysis it already holds.

import type { DimensionChange, ScoreUpdatedData } from "./payload";

interface SubLike {
  key?: string;
  label?: string;
  value?: number;
}

export interface EvidenceLike {
  dimension?: string | null;
  label?: string | null;
  created_at?: string | null;
}

function subsOf(analysis: unknown): SubLike[] {
  const subs = (analysis as { subs?: unknown } | null)?.subs;
  return Array.isArray(subs) ? (subs as SubLike[]) : [];
}

function byMove(a: DimensionChange, b: DimensionChange): number {
  return Math.abs(b.after - b.before) - Math.abs(a.after - a.before);
}

/**
 * Dimensions whose rounded score differs between `before` and `after`
 * (analysis_json shapes), biggest move first, each with up to three evidence
 * labels on file for that dimension (newest first when dated).
 */
export function dimensionChanges(before: unknown, after: unknown, evidence: readonly EvidenceLike[] = []): DimensionChange[] {
  const prev = new Map(subsOf(before).filter((s) => typeof s.key === "string").map((s) => [s.key as string, s]));
  const out: DimensionChange[] = [];
  for (const s of subsOf(after)) {
    if (typeof s.key !== "string" || typeof s.value !== "number") continue;
    const p = prev.get(s.key);
    if (!p || typeof p.value !== "number") continue;
    if (Math.round(p.value) === Math.round(s.value)) continue;
    const labels = evidence
      .filter((e) => (e.dimension ?? "").toLowerCase() === s.key && typeof e.label === "string" && e.label.trim())
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
      .slice(0, 3)
      .map((e) => (e.label as string).trim().slice(0, 120));
    out.push({ key: s.key, label: s.label ?? s.key.toUpperCase(), before: Math.round(p.value), after: Math.round(s.value), evidence: labels });
  }
  return out.sort(byMove);
}

/** Fold a newer re-score into a pending one: first "before", latest "after", merged moves. */
export function mergeScoreUpdate(pending: ScoreUpdatedData | undefined, next: ScoreUpdatedData): ScoreUpdatedData {
  if (!pending) return next;
  const byKey = new Map<string, DimensionChange>();
  for (const c of pending.changes ?? []) byKey.set(c.key, c);
  for (const c of next.changes) {
    const old = byKey.get(c.key);
    byKey.set(c.key, old ? { ...c, before: old.before } : c);
  }
  const changes = [...byKey.values()].filter((c) => c.before !== c.after).sort(byMove);
  return { ...next, previous_svi: pending.previous_svi, changes };
}
