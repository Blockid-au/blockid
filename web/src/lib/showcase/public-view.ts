// Track B B6 — pure builders for the /showcase/blockid public mirror.
// Consumes the same DataRoomShowcaseRow[] the /guide/reports gallery uses
// (buildShowcaseDataRoomRows) so the redaction rules stay identical:
// metadata only (agent, phase, generated_at, version) — never report body.
//
// No I/O. Every helper takes fully-materialised inputs so the page component
// stays thin and each aggregate is unit-testable in isolation.

import type { DataRoomShowcaseRow, ShowcaseAgent } from "./report-tagging";
import { agentLabel, PHASE_COUNT, PHASE_LABELS } from "./gallery";

export interface AgentActivity {
  agent: ShowcaseAgent;
  label: string;
  count: number;
  latest_at: string | null;
}

// Per-agent card: how many artefacts and when the most recent one landed.
// Sorted by count desc, then agent asc so the ordering is deterministic
// regardless of insertion order.
export function buildAgentActivity(rows: DataRoomShowcaseRow[]): AgentActivity[] {
  const byAgent = new Map<ShowcaseAgent, { count: number; latest_at: string | null }>();
  for (const row of rows) {
    const entry = byAgent.get(row.generated_by_agent);
    if (entry) {
      entry.count += 1;
      if (row.generated_at && (!entry.latest_at || row.generated_at > entry.latest_at)) {
        entry.latest_at = row.generated_at;
      }
    } else {
      byAgent.set(row.generated_by_agent, {
        count: 1,
        latest_at: row.generated_at,
      });
    }
  }
  const out: AgentActivity[] = [];
  for (const [agent, entry] of byAgent) {
    out.push({
      agent,
      label: agentLabel(agent),
      count: entry.count,
      latest_at: entry.latest_at,
    });
  }
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.agent.localeCompare(b.agent);
  });
  return out;
}

export interface PhaseArtifactCount {
  phase: number;
  label: string;      // English label from PHASE_LABELS
  count: number;
}

// One entry per Phase 1..12 (even zero-count phases so the marketing strip
// visually communicates "we've been through them all"). Cross-cutting rows
// (phase=null) are intentionally NOT rolled up here — they surface via the
// buildCrossCuttingCount helper below so the strip stays 12 wide.
export function buildPhaseArtifactCounts(
  rows: DataRoomShowcaseRow[],
): PhaseArtifactCount[] {
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.phase_at_generation === null) continue;
    counts.set(row.phase_at_generation, (counts.get(row.phase_at_generation) ?? 0) + 1);
  }
  const out: PhaseArtifactCount[] = [];
  for (let phase = 1; phase <= PHASE_COUNT; phase += 1) {
    out.push({
      phase,
      label: PHASE_LABELS[phase].en,
      count: counts.get(phase) ?? 0,
    });
  }
  return out;
}

export function buildCrossCuttingCount(rows: DataRoomShowcaseRow[]): number {
  let n = 0;
  for (const row of rows) if (row.phase_at_generation === null) n += 1;
  return n;
}

// Best-effort "current phase" heuristic — the highest-numbered phase that
// has at least one artefact within the recency window. Falls back to the
// overall max phase, then null if nothing is tagged.
//
// Rationale: reseller/founder progression is directional — a Phase 11
// artefact from last week is a stronger current-state signal than a Phase
// 4 architecture note produced today. Using max-phase-with-recent-activity
// prevents the marketing page from "regressing" when we file a
// cross-cutting audit at Phase 4 during a real-world Phase 11 sprint.
export function deriveCurrentPhase(
  rows: DataRoomShowcaseRow[],
  opts: { now?: Date; recencyDays?: number } = {},
): number | null {
  const now = opts.now ?? new Date();
  const recencyDays = opts.recencyDays ?? 30;
  const cutoff = new Date(now.getTime() - recencyDays * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  let recentMax: number | null = null;
  let overallMax: number | null = null;
  for (const row of rows) {
    if (row.phase_at_generation === null) continue;
    if (overallMax === null || row.phase_at_generation > overallMax) {
      overallMax = row.phase_at_generation;
    }
    if (row.generated_at && row.generated_at >= cutoffIso) {
      if (recentMax === null || row.phase_at_generation > recentMax) {
        recentMax = row.phase_at_generation;
      }
    }
  }
  return recentMax ?? overallMax;
}

export interface ShowcaseSummary {
  total_reports: number;
  agents_covered: number;
  phases_with_activity: number;
  cross_cutting: number;
  current_phase: number | null;
  latest_generated_at: string | null;
}

export function summarisePublicView(
  rows: DataRoomShowcaseRow[],
  opts: { now?: Date; recencyDays?: number } = {},
): ShowcaseSummary {
  const agents = new Set<ShowcaseAgent>();
  const phases = new Set<number>();
  let latest: string | null = null;
  let crossCutting = 0;
  for (const row of rows) {
    agents.add(row.generated_by_agent);
    if (row.phase_at_generation !== null) phases.add(row.phase_at_generation);
    else crossCutting += 1;
    if (row.generated_at && (!latest || row.generated_at > latest)) {
      latest = row.generated_at;
    }
  }
  return {
    total_reports: rows.length,
    agents_covered: agents.size,
    phases_with_activity: phases.size,
    cross_cutting: crossCutting,
    current_phase: deriveCurrentPhase(rows, opts),
    latest_generated_at: latest,
  };
}

export interface MilestoneEntry {
  id: string;
  order: number;    // insertion order in the state file, 1-based
}

// milestone-report-state.json holds `reportedMilestoneIds: string[]`. We
// expose them newest-first (last-in = most-recently reported) so the page
// timeline reads chronologically without needing a separate catalogue file.
// Cap the list so a runaway state file can't blow up the page.
export function buildMilestoneTimeline(
  reportedMilestoneIds: readonly string[],
  opts: { limit?: number } = {},
): MilestoneEntry[] {
  const limit = opts.limit ?? 12;
  const entries: MilestoneEntry[] = [];
  for (let i = reportedMilestoneIds.length - 1; i >= 0; i -= 1) {
    entries.push({ id: reportedMilestoneIds[i], order: i + 1 });
    if (entries.length >= limit) break;
  }
  return entries;
}
