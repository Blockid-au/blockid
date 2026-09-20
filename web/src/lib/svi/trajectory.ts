// Longitudinal trajectory — pure builder (G21 P3-A).
//
// Turns a project's snapshot series (`svi_snapshots`: svi_total,
// evidence_confidence, stage per snapshot_date), its evidence records
// (`evidence_records`: evidence_type L1–L6 + submitted_at) and its CONFIRMED
// outcomes (`startup_outcomes`) into one time-indexed series from Day 0
// (the first snapshot):
//
//   points[]      one per snapshot day — SVI, Evidence Confidence, stage,
//                 cumulative evidence records by level as at that day
//   markers[]     confirmed outcomes placed on the same day axis
//   milestones    the Day 0 / 60 / 180 tiles (nearest snapshot at or before
//                 each mark; null when the record is younger than the mark)
//   state         "empty" (no snapshot) · "single" (one) · "series" (≥ 2)
//
// No forecasting: the builder describes what was observed and when. The
// component (components/svi/TrajectoryTimeline.tsx) renders it; the a11y
// table fallback is `trajectoryTable()`.

import { badgeForLevel, type EvidenceLevelBadge } from "./evidence-confidence";
import { outcomeSummary, type OutcomeKind, type OutcomeSource } from "@/lib/outcomes/types";

export interface TrajectorySnapshotInput {
  snapshot_date: string;
  svi_total: number | null;
  evidence_confidence: number | null;
  stage: number | null;
}

export interface TrajectoryEvidenceInput {
  /** `evidence_records.evidence_type` (L1_self_declared … L6_third_party_verified) or a ladder level name. */
  evidence_type: string;
  submitted_at: string;
  status?: string | null;
}

export interface TrajectoryOutcomeInput {
  id: string;
  kind: OutcomeKind;
  observed_at: string;
  value: Record<string, unknown>;
  source: OutcomeSource;
  status: string;
}

export interface TrajectoryInput {
  snapshots: readonly TrajectorySnapshotInput[];
  evidenceRecords: readonly TrajectoryEvidenceInput[];
  outcomes: readonly TrajectoryOutcomeInput[];
  /** Current BlockID Verified level (projects.verification_level), shown on the latest point. */
  verificationLevel: string | null;
  now?: Date;
}

export const EVIDENCE_BADGES: readonly EvidenceLevelBadge[] = Object.freeze(["L1", "L2", "L3", "L4", "L5", "L6"]);

export interface TrajectoryPoint {
  day: number;
  date: string;
  svi: number;
  confidence: number | null;
  stage: number | null;
  evidenceByLevel: Record<EvidenceLevelBadge, number>;
  evidenceTotal: number;
  highestLevel: EvidenceLevelBadge | null;
}

export interface TrajectoryMarker {
  id: string;
  day: number;
  date: string;
  kind: OutcomeKind;
  label: string;
  source: OutcomeSource;
}

export interface TrajectoryMilestone {
  mark: 0 | 60 | 180;
  point: TrajectoryPoint | null;
  /** SVI change against Day 0 (null on Day 0 or when absent). */
  sviDelta: number | null;
  confidenceDelta: number | null;
}

export interface Trajectory {
  state: "empty" | "single" | "series";
  day0: string | null;
  spanDays: number;
  points: TrajectoryPoint[];
  markers: TrajectoryMarker[];
  milestones: TrajectoryMilestone[];
  latest: TrajectoryPoint | null;
  verificationLevel: string | null;
  /** Confirmed outcomes newer than the latest snapshot (still drawn, past the last point). */
  outcomesAfterLatest: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const MILESTONE_DAYS: readonly (0 | 60 | 180)[] = Object.freeze([0, 60, 180]);

function dayStart(iso: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Map `L3_uploaded_document` / `document_uploaded` / `L3` → "L3". */
export function badgeOfEvidenceType(t: string | null | undefined): EvidenceLevelBadge | null {
  if (!t) return null;
  const m = /^(L[1-6])/i.exec(t.trim());
  if (m) return m[1]!.toUpperCase() as EvidenceLevelBadge;
  return badgeForLevel(t) ?? null;
}

function emptyLevels(): Record<EvidenceLevelBadge, number> {
  return { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0 };
}

export function buildTrajectory(input: TrajectoryInput): Trajectory {
  const snaps = input.snapshots
    .map((s) => ({ ...s, ms: dayStart(s.snapshot_date) }))
    .filter((s): s is TrajectorySnapshotInput & { ms: number } => s.ms !== null && typeof s.svi_total === "number" && Number.isFinite(s.svi_total))
    .sort((a, b) => a.ms - b.ms);
  // One point per day — keep the latest snapshot of a day.
  const byDay = new Map<number, (typeof snaps)[number]>();
  for (const s of snaps) byDay.set(s.ms, s);
  const uniq = [...byDay.values()].sort((a, b) => a.ms - b.ms);

  if (uniq.length === 0) {
    return { state: "empty", day0: null, spanDays: 0, points: [], markers: [], milestones: MILESTONE_DAYS.map((mark) => ({ mark, point: null, sviDelta: null, confidenceDelta: null })), latest: null, verificationLevel: input.verificationLevel, outcomesAfterLatest: 0 };
  }

  const day0Ms = uniq[0]!.ms;
  const evidence = input.evidenceRecords
    .filter((e) => !e.status || e.status === "active" || e.status === "expired" || e.status === "superseded")
    .map((e) => ({ badge: badgeOfEvidenceType(e.evidence_type), ms: dayStart(e.submitted_at) }))
    .filter((e): e is { badge: EvidenceLevelBadge; ms: number } => e.badge !== null && e.ms !== null)
    .sort((a, b) => a.ms - b.ms);

  const points: TrajectoryPoint[] = [];
  let ei = 0;
  const running = emptyLevels();
  for (const s of uniq) {
    while (ei < evidence.length && evidence[ei]!.ms <= s.ms) {
      running[evidence[ei]!.badge] += 1;
      ei += 1;
    }
    const evidenceByLevel = { ...running };
    const evidenceTotal = EVIDENCE_BADGES.reduce((n, b) => n + evidenceByLevel[b], 0);
    let highestLevel: EvidenceLevelBadge | null = null;
    for (const b of [...EVIDENCE_BADGES].reverse()) if (evidenceByLevel[b] > 0) { highestLevel = b; break; }
    points.push({
      day: Math.round((s.ms - day0Ms) / DAY_MS),
      date: isoDay(s.ms),
      svi: Math.round(s.svi_total as number),
      confidence: typeof s.evidence_confidence === "number" && Number.isFinite(s.evidence_confidence) ? Math.round(s.evidence_confidence) : null,
      stage: typeof s.stage === "number" && Number.isFinite(s.stage) ? s.stage : null,
      evidenceByLevel,
      evidenceTotal,
      highestLevel,
    });
  }

  const latest = points[points.length - 1]!;
  const markers: TrajectoryMarker[] = [];
  let outcomesAfterLatest = 0;
  for (const o of input.outcomes) {
    if (o.status !== "confirmed") continue;
    const ms = dayStart(o.observed_at);
    if (ms === null) continue;
    const day = Math.round((ms - day0Ms) / DAY_MS);
    if (day > latest.day) outcomesAfterLatest += 1;
    markers.push({ id: o.id, day, date: isoDay(ms), kind: o.kind, label: outcomeSummary(o), source: o.source });
  }
  markers.sort((a, b) => a.day - b.day || a.kind.localeCompare(b.kind));

  const day0 = points[0]!;
  const milestones: TrajectoryMilestone[] = MILESTONE_DAYS.map((mark) => {
    // nearest point at or before the mark; the record must have reached the mark (latest.day ≥ mark) for 60 / 180
    if (mark > 0 && latest.day < mark) return { mark, point: null, sviDelta: null, confidenceDelta: null };
    let pick: TrajectoryPoint | null = null;
    for (const p of points) if (p.day <= mark) pick = p;
    if (!pick) return { mark, point: null, sviDelta: null, confidenceDelta: null };
    return {
      mark,
      point: pick,
      sviDelta: mark === 0 ? null : pick.svi - day0.svi,
      confidenceDelta: mark === 0 || pick.confidence === null || day0.confidence === null ? null : pick.confidence - day0.confidence,
    };
  });

  const spanDays = Math.max(latest.day, ...markers.map((m) => m.day), 0);
  return { state: points.length >= 2 ? "series" : "single", day0: day0.date, spanDays, points, markers, milestones, latest, verificationLevel: input.verificationLevel, outcomesAfterLatest };
}

/** Rows for the visually-hidden a11y table (one per point, then one per marker). */
export function trajectoryTable(t: Trajectory): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = t.points.map((p) => ({
    Day: String(p.day),
    Date: p.date,
    SVI: String(p.svi),
    "Evidence confidence": p.confidence === null ? "—" : String(p.confidence),
    "Evidence records": String(p.evidenceTotal),
    "Highest evidence level": p.highestLevel ?? "—",
    Stage: p.stage === null ? "—" : String(p.stage),
    Outcome: "",
  }));
  for (const m of t.markers) rows.push({ Day: String(m.day), Date: m.date, SVI: "", "Evidence confidence": "", "Evidence records": "", "Highest evidence level": "", Stage: "", Outcome: `${m.kind.replace(/_/g, " ")} — ${m.label}` });
  return rows;
}

/** "Day 0 · 12 Mar 2026" style label. */
export function milestoneLabel(m: TrajectoryMilestone): string {
  return `Day ${m.mark}`;
}
