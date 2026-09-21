// grounding — the deterministic §5.4 citation gate over a whole ReportV2
// (G23-A). The pipeline measures `quality.groundedShare` at run time with
// the llm-auditor sweep (executive + 8 chapters + 13 criterion sections); a
// read-time projection (adapter / fixture) never ran that sweep and used to
// print "grounded 0 %". This helper runs the same Stage-1 gate — every
// material claim carries an `[ev:<id>]` from the section’s own evidence rows
// or an explicit unevidenced marker — over the executive thesis, each
// chapter (verdict + bullets) and each criterion card (its citations count),
// so the number on the appendix means the same thing on every document.
// Pure; client-safe.

import { autoCite, itemsFromEvidenceRows } from "@/lib/report-pipeline/auto-cite";
import { hasCitationOrMarker, isMaterialClaim, splitClaims } from "@/lib/report-pipeline/claim-gate";
import type { ReportV2 } from "./schema";

export interface GroundingSection {
  id: string;
  grounded: boolean;
  /** Material claims carrying neither a citation nor a marker (≤ 4 kept). */
  uncited: string[];
}

export interface GroundingAudit {
  sections: GroundingSection[];
  /** Grounded sections ÷ all sections, 2 dp; 0 when there is nothing to audit. */
  groundedShare: number;
}

function uncitedIn(text: string, allowed: string[]): string[] {
  const set = new Set(allowed.map((id) => id.toLowerCase()));
  const out: string[] = [];
  for (const claim of splitClaims(text)) {
    if (!isMaterialClaim(claim) || hasCitationOrMarker(claim, set)) continue;
    out.push(claim.length > 160 ? `${claim.slice(0, 157)}...` : claim);
    if (out.length >= 4) break;
  }
  return out;
}

/** Run the Stage-1 gate over every section of a ReportV2 (auto-citing register numbers first, as the pipeline does). */
export function groundingAudit(report: ReportV2): GroundingAudit {
  const register = report.appendix.evidenceRegister;
  const allIds = register.map((e) => e.evidence_id);
  const sections: GroundingSection[] = [];
  const check = (id: string, text: string, ids: string[]) => {
    const rows = register.filter((e) => ids.includes(e.evidence_id));
    const cited = autoCite(text, itemsFromEvidenceRows(rows)).text;
    const uncited = uncitedIn(cited, ids);
    sections.push({ id, grounded: uncited.length === 0, uncited });
  };
  if (report.executive.thesis.trim()) check("executive", report.executive.thesis, allIds);
  for (const d of report.dimensions) {
    const ids = d.evidence.map((e) => e.evidence_id);
    check(`dim:${d.dim}`, [d.verdict, ...d.strengths.map((s) => `- ${s}`), ...d.gaps.map((g) => `- ${g}`)].join("\n"), ids);
    for (const c of d.criteria) {
      if (c.citations.length > 0) sections.push({ id: `card:${d.dim}:${c.key}`, grounded: true, uncited: [] });
      else check(`card:${d.dim}:${c.key}`, c.verdict, ids);
    }
  }
  const grounded = sections.filter((s) => s.grounded).length;
  return { sections, groundedShare: sections.length ? Math.round((grounded / sections.length) * 100) / 100 : 0 };
}

export function groundedShareOfReport(report: ReportV2): number {
  return groundingAudit(report).groundedShare;
}
