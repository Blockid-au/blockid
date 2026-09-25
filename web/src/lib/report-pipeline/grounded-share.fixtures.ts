// grounded-share fixtures — two offline replicas of the §5.4 audit sweep
// (orchestrator auditAllSections) shaped on the audit logs of two live
// standard-tier reports (2026-09-23 04:06, pipeline r9: 22 sections, share
// 0.73; 2026-09-24 08:37, pipeline r10: 15 sections, share 0.73). The
// startups, names and ids are fictional; each ungrounded section keeps the
// SENTENCE SHAPE the live gate flagged, so the fixture share moves only when
// the gate's definition or the citable pool changes — never because a
// fixture sentence was rewritten to pass.
//
// Every section goes through autoCite first (the dispatcher does this to
// criterion prose and chapter bullets, the orchestrator to the thesis), then
// auditSections with the standard-tier options (LLM pass only on sections
// Stage 1 flagged, cap 8). The stub critic returns the finding the live
// critic returned for the sections that had one, "- none" elsewhere — a
// model call is never made. Pure data + helpers; test-only consumers.

import type { ModelCaller } from "@/lib/adk";
import { autoCite, itemsFromCatalogue, itemsFromModuleOutputs, type CitableItem } from "./auto-cite";
import { AU_CONTEXT_FACTS, COMPUTED_FACT_IDS, COMPUTED_FACT_LABELS } from "./computed-facts";
import { AUDITOR_CAP_BY_TIER, auditSections, type AuditableSection, type SectionAuditOutcome } from "./llm-auditor";

export interface FixtureSection {
  id: string;
  content: string;
  /** Evidence ids (register rows) the section may cite. */
  ids: string[];
  /** Deterministic module outputs the section may cite (chapters only). */
  modules?: Array<{ id: string; output: Record<string, unknown> }>;
  /** The live critic's finding for this section, when it had one. */
  criticFinding?: string;
}

export interface FixtureRun {
  name: string;
  /** groundedShare the live pipeline logged for the report this run mirrors. */
  liveShare: number;
  register: Array<{ evidence_id: string; label: string; content: string }>;
  sections: FixtureSection[];
}

const AU_CTX = COMPUTED_FACT_IDS["au-context"];
const auContextRow = () => ({ evidence_id: AU_CTX, label: COMPUTED_FACT_LABELS["au-context"], content: AU_CONTEXT_FACTS });

const BENCH = "5a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const SVI = "6b2e3d4c-5f6a-4b7c-9d8e-0f1a2b3c4d5e";
const DESC = "7c3f4e5d-6a7b-4c8d-8e9f-1a2b3c4d5e6f";
const FOUNDER = "8d4a5f6e-7b8c-4d9e-9f0a-2b3c4d5e6f7a";
const COMPLIANCE_MODULE = "agents/clo-compliance.ts:calculateComplianceScore";

const benchRow = { evidence_id: BENCH, label: "Benchmarks: stage quartiles p25 / p50 / p75 (computed)", content: "TRE p25 37 / p50 52 / p75 67, −22 points vs the p50 median; MPC p25 46 / p50 58 / p75 70" };
const sviRow = { evidence_id: SVI, label: "SVI scores (computed by the platform)", content: "SVI index 38 (open-ended, base 100); TRE 30/100; MPC 50/100; LCO 40/100" };
const descRow = { evidence_id: DESC, label: "Startup description", content: "A care-coordination platform for home-care providers; 3,302 weekly schedule snapshots collected in the pilot." };
const founderRow = { evidence_id: FOUNDER, label: "Founder execution profile", content: "years_in_domain = 20; exits = 0; full_time = yes" };

const CLEAN_CHAPTER = (dim: string): FixtureSection => ({
  id: `dim:${dim}`,
  content: `${dim.toUpperCase()} sits below the p50 stage median [ev:${BENCH}].\n- Founder has deep domain experience [ev:${FOUNDER}]\n- No connected analytics yet [unevidenced]`,
  ids: [BENCH, SVI, FOUNDER],
});
const CLEAN_CRITERION = (id: string): FixtureSection => ({
  id,
  content: `${id} — Early but Coherent\n\n> **Key Insight:** the pilot collected 3,302 weekly schedule snapshots.\n\n### Assessment\nThe evidence is thin but consistent with the stage [ev:${BENCH}].\n\n### Recommended Actions\n1. Connect analytics.\n<!-- SCORE: 40 -->`,
  ids: [BENCH, SVI, DESC],
});

/** Mirrors the 2026-09-24 08:37 live report (r10, 15 sections, logged 0.73). */
export const RUN_R10: FixtureRun = {
  name: "r10-free-report",
  liveShare: 0.73,
  register: [benchRow, sviRow, descRow, founderRow, auContextRow()],
  sections: [
    {
      // Headline figure no row holds — genuinely uncited; only the prompt contract can prevent it.
      id: "executive",
      content: `CareBridge: a pre-MVP platform tackling Australia's A$60B+ aged care coordination gap.\n\nThe pilot collected 3,302 weekly schedule snapshots [ev:${DESC}], and the SVI index sits at 38 [ev:${SVI}].`,
      ids: [BENCH, SVI, DESC, FOUNDER, AU_CTX],
    },
    ...["svm", "tre", "ftv", "ptd", "iri", "mpc", "lco", "cgh"].map(CLEAN_CHAPTER),
    CLEAN_CRITERION("code_git"),
    {
      // Market sizes nobody supplied — genuinely uncited, must stay ungrounded.
      id: "market",
      content: [
        "Market Opportunity — A$30B+ Addressable Market",
        "",
        "CareBridge operates at the intersection of two large programs: residential and home aged care (A$27 billion in 2024-25, growing to A$34 billion by 2027-28) and disability support.",
        "",
        "Australia's Royal Commission into Aged Care Quality and Safety (2021) and subsequent reforms are driving a shift toward home-based care.",
        "",
        "### Recommended Actions",
        "**60 days**: Publish 3 cornerstone articles and launch a Google Ads pilot with A$2,000 budget.",
      ].join("\n"),
      ids: [BENCH, SVI, DESC],
    },
    CLEAN_CRITERION("founder_profile"),
    {
      // Cites the AU-context row for a figure the CFO prompt states (GST threshold) but the row did not hold.
      id: "revenue",
      content: [
        "Revenue & Unit Economics — Pre-Revenue",
        "",
        `GST registration is required once turnover exceeds A$75k [ev:${AU_CTX}].`,
        "",
        "### Risks",
        "- **GST registration required once turnover exceeds A$75k — cash flow impact** (low) — Plan for GST compliance in the financial model",
      ].join("\n"),
      ids: [BENCH, SVI, DESC, AU_CTX],
    },
    CLEAN_CRITERION("customer_size"),
    {
      // A statute's year is part of its name, not a figure.
      id: "documents",
      content: [
        "Key Documents — Foundations Missing",
        "",
        "Given the handling of sensitive health data for care recipients, compliance with the Privacy Act 1988 and the Australian Privacy Principles (APPs) is mandatory.",
      ].join("\n"),
      ids: [BENCH, SVI, DESC],
    },
  ],
};

/** Mirrors the 2026-09-23 04:06 live report (r9, 22 sections, logged 0.73). */
export const RUN_R9: FixtureRun = {
  name: "r9-standard-report",
  liveShare: 0.73,
  register: [benchRow, sviRow, descRow, founderRow, auContextRow()],
  sections: [
    {
      id: "executive",
      content: `Blockchain legaltech for Australia's A$24B market\n\nThe founder brings 20 years of domain experience [ev:${FOUNDER}].`,
      ids: [BENCH, SVI, DESC, FOUNDER, AU_CTX],
      criticFinding: `"The founder has 10 years of domain experience" — the EVIDENCE shows 20 years.`,
    },
    {
      // Regression: an uncited numeric claim (0% — no row holds it) stays ungrounded.
      id: "dim:tre",
      content: `TRE is at the p50 median for the stage [ev:${BENCH}]. The entire AARRR funnel is at 0% — a clean slate.\n- Clean slate — no churn history`,
      ids: [BENCH, SVI],
      criticFinding: `"achievable with 10+ customer interviews and a waitlist" — a specific claim not supported by any evidence row.`,
    },
    {
      // A module citation in the [module:<id>] form the chapter prompt used to ask for.
      id: "dim:lco",
      content: `Compliance is 75% complete, 12 of 16 items done [module:${COMPLIANCE_MODULE}].\n- Terms of Service and Privacy Policy live [module:${COMPLIANCE_MODULE}]`,
      ids: [BENCH, SVI],
      modules: [{ id: COMPLIANCE_MODULE, output: { score: 75, completedCount: 12, totalItems: 16 } }],
    },
    ...["ftv", "ptd", "cgh", "iri", "svm", "mpc"].map(CLEAN_CHAPTER),
    CLEAN_CRITERION("code_git"),
    CLEAN_CRITERION("market"),
    {
      id: "founder_profile",
      content: "Founder Profile — Deep Domain, Solo\n\n### Recommended Actions\n1. Recruit a technical co-founder. Offer 0.5-1% equity each with a 2-year vest.",
      ids: [BENCH, SVI, FOUNDER],
    },
    CLEAN_CRITERION("revenue"),
    CLEAN_CRITERION("customer_size"),
    {
      id: "documents",
      content: [
        "Key Documents — Register the Company First",
        "",
        "Directors must comply with duties under s180-184 of the Corporations Act 2001, including care and diligence.",
        "Compliance with the Privacy Act 1988 and Australian Consumer Law (ACL) will be essential.",
      ].join("\n"),
      ids: [BENCH, SVI, DESC],
    },
    CLEAN_CRITERION("idea"),
    CLEAN_CRITERION("website"),
    {
      // Title figure + a vision statement with numbers no row holds — genuinely uncited.
      id: "gtm_strategy",
      content: "Market Opportunity — A$24B Addressable Market\n\nMission statement: 'To make legal trust programmable.' 3-year vision: 'The platform is used by 50 Australian law firms, reducing contract dispute resolution time by 40%.'",
      ids: [BENCH, SVI, DESC],
      criticFinding: `"A$24B Addressable Market" — no evidence supports a A$24 billion market figure.`,
    },
    {
      id: "team",
      content: "Team Composition — Solo Founder\n\n### Equity\nWe recommend allocating 10% initially, with a 4-year vesting schedule and a 1-year cliff for all co-founders and early employees.",
      ids: [BENCH, SVI, FOUNDER],
    },
    CLEAN_CRITERION("dataroom"),
    CLEAN_CRITERION("team_structure"),
    CLEAN_CRITERION("roadmap"),
  ],
};

/** The critic stub: the live finding for a section that had one, "- none" otherwise. Counts calls. */
export function stubCritic(run: FixtureRun): { model: ModelCaller; calls: () => number } {
  let calls = 0;
  const model: ModelCaller = async (system, user) => {
    calls += 1;
    if (/revise startup-report prose/i.test(system)) return user.replace(/^## DRAFT\n/, "");
    const hit = run.sections.find((s) => s.criticFinding && user.includes(s.content.slice(0, 40)));
    return hit ? `FINDINGS:\n- ${hit.criticFinding}\nVERDICT: NEEDS_REVISION` : "FINDINGS:\n- none\nVERDICT: ACCURATE";
  };
  return { model, calls: () => calls };
}

/** The citable pool of one section: its register rows + its module outputs. */
export function citableFor(run: FixtureRun, s: FixtureSection): CitableItem[] {
  return [...itemsFromCatalogue(run.register.filter((r) => s.ids.includes(r.evidence_id))), ...itemsFromModuleOutputs(s.modules ?? [])];
}

/** Replay the standard-tier sweep: autoCite → Stage 1 → capped critic on flagged sections. */
export async function replayRun(run: FixtureRun): Promise<{ groundedShare: number; outcomes: SectionAuditOutcome[]; modelCalls: number }> {
  const sections: AuditableSection[] = run.sections.map((s) => {
    const citable = citableFor(run, s);
    return {
      id: s.id,
      title: s.id,
      content: autoCite(s.content, citable).text,
      allowedEvidenceIds: [...s.ids, ...(s.modules ?? []).map((m) => m.id)],
      citable,
    };
  });
  const critic = stubCritic(run);
  const outcomes = await auditSections(sections, "fixture evidence", critic.model, { llmOnlyWhenUncited: true, maxLlmSections: AUDITOR_CAP_BY_TIER.standard });
  const grounded = outcomes.filter((o) => o.grounded).length;
  return { groundedShare: Math.round((grounded / outcomes.length) * 100) / 100, outcomes, modelCalls: critic.calls() };
}
