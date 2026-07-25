// Unicorn Playbook — Subgoal 13 (Ship 1)
// -----------------------------------------------------------------------------
// The 12-phase `GROWTH_PHASES` spec ships with 60 steps + 48 deliverables. That
// backbone is solid, but recon of the Atlassian fixture (993 lines, 20 real
// milestones), the Canva / Xero / SafetyCulture inline timelines, and the
// `guide/startup-journey.ts` narrative surfaced 14 concrete tasks that unicorn
// founders actually did which the current spec does NOT surface as first-class
// deliverables.
//
// This module is **pure data** — a typed const list of tasks that the Package
// UI (see `components/startup-package/unicorn-playbook-panel.tsx`) renders as
// an *optional-but-recommended* checklist inside each phase card. Each row
// cross-references the case-study milestone that inspired it so the founder
// can click through to "here is who did this and when it worked."
//
// This file has no runtime cost — pure exports, easy to test.

import type { GrowthPhaseId } from "../journey-map";

/**
 * Optionality label — used by the UI to tint the badge.
 * - `table-stakes` — every serious founder does this eventually; skipping is a
 *   red flag for investors.
 * - `recommended` — high leverage, most unicorn founders did some version of
 *   it. Not shipping this is fine short-term but starts to hurt at scale.
 * - `differentiator` — a rarer, high-signal move that turns heads at the
 *   Series A / B pitch. Not required — but doing it early moves the SVI needle.
 */
export type OptionalityLabel = "recommended" | "table-stakes" | "differentiator";

/**
 * Task type — controls which auto-fill pipeline the "Do this" button dispatches
 * to. Kept string-literal so we can extend without breaking existing callers.
 */
export type UnicornPlaybookTaskType =
  | "template" // one-shot doc render (PDF/DOCX) into the dataroom
  | "guide" // long-form Markdown mentor guide (no dataroom row)
  | "checklist_row_set" // appends rows to an existing checklist (e.g. fundraise-checklist)
  | "form"; // interactive form the founder fills in-app (dataroom + snapshot)

export interface UnicornPlaybookEvidence {
  /** Company name — free-form so we can cite generic patterns ("Superhuman",
   * "Sean Ellis") that aren't first-class case-study fixtures. */
  company: string;
  /** Year the move happened (or the pattern was formalised). */
  year: number;
  /** Optional deep-link to the source (fixture line ref, external URL, etc.). */
  sourceUrl?: string;
}

export interface UnicornPlaybookTask {
  /** Stable identifier used as a React key + deliverable-registry lookup. */
  id: string;
  /** Which of the 12 growth phases this task belongs to. */
  phase: GrowthPhaseId;
  /** UI title — 3-8 words, verb-first. */
  title: string;
  /** One-sentence "why this matters" copy shown under the title. */
  why: string;
  /** Case-study evidence — the founder move that inspired this task. */
  evidence: UnicornPlaybookEvidence;
  /**
   * Slug the "Do this" button POSTs to
   * `/api/startup-package/deliverable/[slug]` — same endpoint pattern as
   * subgoal 7's Package auto-fill. Prefixed `playbook_` to avoid collisions
   * with the phase-native deliverables that subgoal 6/7 register.
   */
  deliverableSlug: string;
  /** Credit cost surfaced to the founder BEFORE execution (per
   * `feedback_transparent_pricing` memory). Ranges 0.5-1.5 for Ship 1. */
  creditCost: number;
  /** Optionality badge — see {@link OptionalityLabel}. */
  optionalityLabel: OptionalityLabel;
  /** Task type — controls the auto-fill dispatch path. */
  type: UnicornPlaybookTaskType;
}

/**
 * The 14 unicorn-playbook tasks Ship 1 authors. See
 * `docs/plans/spawn-agent-v-d-ng-cosmic-aho.md` §"14 tasks to author" for the
 * mapping table + source rationale.
 *
 * Ordering: by phase (declaration order in `journey-map.ts:GROWTH_PHASE_IDS`),
 * then by declaration order within phase. The UI groups by phase — order only
 * affects the intra-phase display order.
 */
export const UNICORN_PLAYBOOK_TASKS: readonly UnicornPlaybookTask[] = [
  // ── customer_dev ──────────────────────────────────────────────────────────
  {
    id: "playbook.customer_dev.pmf_survey",
    phase: "customer_dev",
    title: "PMF survey (Sean Ellis 40% test)",
    why: "The single most predictive early-stage question — asking users 'how would you feel if you could no longer use this product?' Superhuman turned it into a rigorous PMF gate.",
    evidence: { company: "Superhuman", year: 2018, sourceUrl: "https://firstround.com/review/how-superhuman-built-an-engine-to-find-product-market-fit/" },
    deliverableSlug: "playbook_customer_dev_pmf_survey",
    creditCost: 1,
    optionalityLabel: "table-stakes",
    type: "form",
  },
  {
    id: "playbook.customer_dev.first_100_list",
    phase: "customer_dev",
    title: "First-100-customers named list",
    why: "A written list of the first 100 humans you will ask to try the product — by name, channel, and expected response — beats generic 'launch on Product Hunt' every time.",
    evidence: { company: "Atlassian", year: 2003, sourceUrl: "web/src/lib/showcase/atlassian/fixture.ts:189-198" },
    deliverableSlug: "playbook_customer_dev_first_100_list",
    creditCost: 0.5,
    optionalityLabel: "recommended",
    type: "template",
  },

  // ── team ─────────────────────────────────────────────────────────────────
  {
    id: "playbook.team.first_hire_scorecard",
    phase: "team",
    title: "First-hire scorecard (Topgrading / Who method)",
    why: "Formal outcome-based scorecard before you interview candidate #1 — Canva and Xero both cite this practice as the single biggest factor in avoiding a bad first-10 hire.",
    evidence: { company: "Canva", year: 2013, sourceUrl: "https://www.whichco.com/who-book" },
    deliverableSlug: "playbook_team_first_hire_scorecard",
    creditCost: 0.5,
    optionalityLabel: "table-stakes",
    type: "template",
  },
  {
    id: "playbook.team.board_charter",
    phase: "team",
    title: "Board charter + independent-director appointment letter",
    why: "Atlassian added an independent chair (Doug Burgum) before their 2015 IPO — the governance layer that unlocks institutional funding rounds.",
    evidence: { company: "Atlassian", year: 2012, sourceUrl: "web/src/lib/showcase/atlassian/fixture.ts:258-261" },
    deliverableSlug: "playbook_team_board_charter",
    creditCost: 1,
    optionalityLabel: "recommended",
    type: "template",
  },

  // ── growth ──────────────────────────────────────────────────────────────
  {
    id: "playbook.growth.quarterly_okr",
    phase: "growth",
    title: "Quarterly OKR / MBR cadence template",
    why: "A written monthly business review pack keeps investors and board aligned without noisy weekly updates — the operating rhythm every unicorn eventually adopts.",
    evidence: { company: "Universal", year: 2015 },
    deliverableSlug: "playbook_growth_quarterly_okr",
    creditCost: 1,
    optionalityLabel: "recommended",
    type: "template",
  },
  {
    id: "playbook.growth.culture_rituals",
    phase: "growth",
    title: "Culture rituals charter (ShipIt-style)",
    why: "Atlassian's quarterly ShipIt hackathon (61 editions and counting) shows the compound value of one recurring cross-functional ritual — plan it before your team hits 30 people.",
    evidence: { company: "Atlassian", year: 2005, sourceUrl: "web/src/lib/guide/startup-journey.ts:699-728" },
    deliverableSlug: "playbook_growth_culture_rituals",
    creditCost: 0.5,
    optionalityLabel: "differentiator",
    type: "template",
  },
  {
    id: "playbook.growth.pledge_one_percent",
    phase: "growth",
    title: "Pledge 1% / impact charter",
    why: "Formalising 1% of equity / product / time for community before you IPO turns a nice-to-have into an unmoveable cap-table line — Atlassian and Canva both did this pre-Series-A.",
    evidence: { company: "Atlassian", year: 2014, sourceUrl: "web/src/lib/guide/startup-journey.ts:741-746" },
    deliverableSlug: "playbook_growth_pledge_one_percent",
    creditCost: 0.5,
    optionalityLabel: "differentiator",
    type: "template",
  },

  // ── funding ─────────────────────────────────────────────────────────────
  {
    id: "playbook.funding.series_a_checklist",
    phase: "funding",
    title: "Series-A readiness checklist (metrics bar + cohort proof)",
    why: "A crisp checklist covering the 20-25 artefacts a serious Series A lead expects — extends the existing fundraise-checklist with the cohort-retention and net-dollar-retention rows that unicorn founders prepare 3 months ahead.",
    evidence: { company: "Universal", year: 2020 },
    deliverableSlug: "playbook_funding_series_a_checklist",
    creditCost: 1,
    optionalityLabel: "table-stakes",
    type: "checklist_row_set",
  },
  {
    id: "playbook.funding.us_flip_memo",
    phase: "funding",
    title: "US-flip / Delaware conversion memo",
    why: "Nine of every ten Aussie unicorns eventually flipped or dual-domiciled — Atlassian's UK-then-US structure shows why a defensible memo now beats a rushed reorg later.",
    evidence: { company: "Atlassian", year: 2014, sourceUrl: "web/src/lib/showcase/atlassian/fixture.ts:274-281" },
    deliverableSlug: "playbook_funding_us_flip_memo",
    creditCost: 1.5,
    optionalityLabel: "recommended",
    type: "template",
  },
  {
    id: "playbook.funding.secondary_sale",
    phase: "funding",
    title: "Secondary-sale playbook",
    why: "Pre-committed secondary schedules avoid the 'signal risk' of ad-hoc founder sales — Atlassian and Canva both used structured secondaries at the mega-round stage.",
    evidence: { company: "Atlassian", year: 2010, sourceUrl: "web/src/lib/showcase/atlassian/fixture.ts:236-244" },
    deliverableSlug: "playbook_funding_secondary_sale",
    creditCost: 1,
    optionalityLabel: "recommended",
    type: "guide",
  },
  {
    id: "playbook.funding.mna_primer",
    phase: "funding",
    title: "Acquisition / M&A term-sheet primer",
    why: "Even without an active acquirer, mapping M&A term-sheet mechanics (cash-vs-stock, earn-out, escrow, MAC clauses) before you get an offer avoids amateur mistakes — Atlassian's OpsGenie deal is the reference case.",
    evidence: { company: "Atlassian", year: 2018, sourceUrl: "web/src/lib/showcase/atlassian/fixture.ts:698-712" },
    deliverableSlug: "playbook_funding_mna_primer",
    creditCost: 1.5,
    optionalityLabel: "recommended",
    type: "guide",
  },

  // ── legal_equity ────────────────────────────────────────────────────────
  {
    id: "playbook.legal_equity.dpa_pack",
    phase: "legal_equity",
    title: "DPA + Australian Privacy Act 2022 pack",
    why: "First enterprise deal will demand a data-processing addendum with SCCs — a pre-drafted pack shortens legal review from six weeks to six days.",
    evidence: { company: "Universal", year: 2022 },
    deliverableSlug: "playbook_legal_equity_dpa_pack",
    creditCost: 1,
    optionalityLabel: "table-stakes",
    type: "template",
  },

  // ── product_dev ─────────────────────────────────────────────────────────
  {
    id: "playbook.product_dev.security_whitepaper",
    phase: "product_dev",
    title: "Enterprise security whitepaper + SOC2 pre-audit",
    why: "SafetyCulture layered SOC2 in the Series C run-up — every mid-market deal from that point cited the whitepaper. Shipping this early expands the SAM without touching product.",
    evidence: { company: "SafetyCulture", year: 2021 },
    deliverableSlug: "playbook_product_dev_security_whitepaper",
    creditCost: 1.5,
    optionalityLabel: "recommended",
    type: "template",
  },

  // ── pitch ───────────────────────────────────────────────────────────────
  {
    id: "playbook.pitch.safe_primer",
    phase: "pitch",
    title: "SAFE (post- vs pre-money) + convertible-note founder primer",
    why: "The difference between a post-money and pre-money SAFE is worth 5-10% dilution at Series A — founders who don't run the math end up over-diluted before their first priced round.",
    evidence: { company: "Universal", year: 2018, sourceUrl: "https://www.ycombinator.com/documents" },
    deliverableSlug: "playbook_pitch_safe_primer",
    creditCost: 0.5,
    optionalityLabel: "table-stakes",
    type: "guide",
  },
];

/**
 * Return only the tasks belonging to a specific growth phase, preserving the
 * declaration order in {@link UNICORN_PLAYBOOK_TASKS}.
 *
 * Unknown phase ids return an empty array (defensive default so callers using
 * an untyped string don't crash the panel render).
 */
export function tasksForPhase(phaseId: GrowthPhaseId): UnicornPlaybookTask[] {
  return UNICORN_PLAYBOOK_TASKS.filter((task) => task.phase === phaseId);
}
