// Free preview for the /funding intake (T0242, plan §4a / §5a).
//
// Pure: takes the parsed intake plus the catalogue rows and returns exactly
// what the free tier is allowed to see — counts, the top-3 names with a
// one-line "why", the top-5 "up to A$X" figure — and nothing that is sold
// (no checklist, no timeline, no estimates). Never empty: when the profile
// matches nothing, the nearest national open rows are returned with a reason
// so the founder still leaves with names and official links to browse.
//
// Colocated tests: preview.test.ts.

import {
  buildTimeline,
  matchGrants,
  matchPrograms,
  type ScoredGrant,
  type ScoredProgram,
} from "@/lib/agents/grant-advisor";
import type { AuGrantRow, AuProgramRow } from "./seed-map";
import { intakeToGrantProfile, locationUnknown, type FundingIntake } from "./intake";

export interface PreviewMatch {
  name: string;
  why: string;
}

export interface PreviewFallback {
  reason: string;
  grants: PreviewMatch[];
  programs: PreviewMatch[];
}

export interface FundingPreviewPayload {
  grant_count: number;
  program_count: number;
  top_grants: PreviewMatch[];
  top_programs: PreviewMatch[];
  /** Sum of amount_max_aud over the top-5 matched grants — the hero number. */
  top_grants_amount_max_aud: number;
  total_amount_max_aud: number;
  timeline_count: number;
  /** Locked counts — what the paid report adds. Surfaced on the paywall card. */
  locked: { checklist_items: number; timeline_items: number; estimates: number };
  /** Only when nothing matched. */
  fallback?: PreviewFallback;
  location_unknown: boolean;
}

/** Restrict the catalogue to national / remote rows when the founder gave no location. */
export function catalogueForIntake(
  intake: FundingIntake,
  grants: AuGrantRow[],
  programs: AuProgramRow[],
): { grants: AuGrantRow[]; programs: AuProgramRow[] } {
  if (!locationUnknown(intake)) return { grants, programs };
  return {
    grants: grants.filter((g) => g.state === "national"),
    programs: programs.filter((p) => p.state === "national" || p.capital === "Remote"),
  };
}

function firstWhy(m: ScoredGrant | ScoredProgram, fallback: string): string {
  const w = m.why.find((s) => s && s.trim().length > 0);
  return w ?? fallback;
}

function nationalFallback(
  intake: FundingIntake,
  grants: AuGrantRow[],
  programs: AuProgramRow[],
): PreviewFallback {
  const openGrants = grants
    .filter((g) => g.state === "national" && g.status === "open" && !g.exclude_from_matching)
    .sort((a, b) => (b.amount_max_aud ?? 0) - (a.amount_max_aud ?? 0))
    .slice(0, 3)
    .map((g) => ({ name: g.name, why: g.summary?.split(/(?<=\.)\s/)[0] ?? "National scheme open to most Australian founders." }));
  const openPrograms = programs
    .filter((p) => (p.state === "national" || p.capital === "Remote") && p.status === "open")
    .slice(0, 3)
    .map((p) => ({ name: p.name, why: p.summary?.split(/(?<=\.)\s/)[0] ?? "Runs remotely / Australia-wide." }));
  const where = intake.state === "not_incorporated" ? "founders who are not incorporated yet" : `${intake.state} at the ${intake.stage.replace(/_/g, " ")} stage`;
  return {
    reason: `Nothing in the catalogue is open right now for ${where}. These national rows are the closest — browse the free directory for the rest.`,
    grants: openGrants,
    programs: openPrograms,
  };
}

export function buildFundingPreview(
  intake: FundingIntake,
  allGrants: AuGrantRow[],
  allPrograms: AuProgramRow[],
  today?: Date,
): FundingPreviewPayload {
  const profile = intakeToGrantProfile(intake);
  const { grants, programs } = catalogueForIntake(intake, allGrants, allPrograms);
  const g = matchGrants(profile, grants, today);
  const p = matchPrograms(profile, programs, today);
  const t = buildTimeline(profile, g, p, today);

  const payload: FundingPreviewPayload = {
    grant_count: g.length,
    program_count: p.length,
    top_grants: g.slice(0, 3).map((m) => ({ name: m.name, why: firstWhy(m, "Fits your stage and state.") })),
    top_programs: p.slice(0, 3).map((m) => ({ name: m.name, why: firstWhy(m, "Takes founders at your stage.") })),
    top_grants_amount_max_aud: g.slice(0, 5).reduce((s, m) => s + (m.grant.amount_max_aud ?? 0), 0),
    total_amount_max_aud: g.reduce((s, m) => s + (m.grant.amount_max_aud ?? 0), 0),
    timeline_count: t.length,
    locked: {
      checklist_items: [...g, ...p].reduce((s, m) => s + m.eligibility_checklist.length, 0),
      timeline_items: t.length,
      estimates: g.filter((m) => typeof m.estimate_aud === "number").length,
    },
    location_unknown: locationUnknown(intake),
  };

  if (g.length === 0 && p.length === 0) {
    payload.fallback = nationalFallback(intake, allGrants, allPrograms);
  }
  return payload;
}
