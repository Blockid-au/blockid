// validation/proposal — the written Cohort proposal (G23-B as the pilot
// proposal; re-based by G25 on 2026-09-21 when the paid pilot and its
// conversion coupon were retired).
//
// The advisor plan's validation Level 3 is "two written proposals with
// scope, price and dates sent to a named organisation". This module turns a
// validation-tracker entry (organisation, contact role, the objection in
// their words, the note) into the document model the react-pdf template
// (lib/pdf/cohort-proposal-pdf.tsx) renders on demand from
// GET /api/admin/validation/[id]/proposal. Nothing is stored except the
// `proposal_generated_at` stamp on the entry.
//
// Rules that bind this file:
//   • every number is a constant — the annual / monthly Cohort prices, the
//     trial length and the plan limits from plans-v2 + plans.generated, the
//     retention line from the privacy policy § 4; no pilot tier, no credit
//     rule, no coupon;
//   • the entity is `LEGAL_ENTITY` (lib/site/legal-entity), the data sentence
//     is `DATA_PRINCIPLE_SENTENCE`, the applicant consent paragraph is
//     `APPLICANT_CONSENT_TEXT`, the disclaimer is the PDF general-advice
//     block — none of them paraphrased;
//   • "what is delivered" is the six-stage workflow that ships today, read
//     from the EN catalogue keys /solutions/accelerator renders
//     (solutions.accelerator.journey.*) so the proposal can never promise
//     more than the page does;
//   • pure and deterministic — `opts.now` drives every date.

import en from "@/lib/i18n/messages/en.json";
import { t, type Messages } from "@/lib/i18n/t";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import { PLANS_V2, formatAud, withGst, type Plan } from "@/lib/plans-v2";
import { COHORT_INCLUDES, COHORT_SUCCESS_METRICS } from "@/lib/accelerator/cohort-offer";
import { APPLICANT_CONSENT_LABEL, APPLICANT_CONSENT_TEXT, DATA_PRINCIPLE_SENTENCE } from "@/lib/accelerator/applicant-consent";
import { PDF_GENERAL_ADVICE_DISCLAIMER } from "@/lib/pdf/advice-disclaimer";
import { BRAND_SITE, LEGAL_ENTITY, legalLine, statutoryLine } from "@/lib/site/legal-entity";
import type { ValidationEntry } from "./model";

export const PROPOSAL_TITLE = "Cohort proposal";

/** The retention line, verbatim from the privacy policy § 4 (content/legal/privacy-v2.mdx). */
export const PROPOSAL_RETENTION_LINE =
  "Startups entered by evaluators, evaluation reports and batches are kept for the life of the evaluator account, or until the evaluator deletes the record, or on request from the founder (Privacy Policy § 4).";

/** How long the quoted price holds — the acceptance line prints the date. */
export const PROPOSAL_VALID_DAYS = 30;

/** The entry note is founder shorthand; the proposal quotes at most this many characters of it (page 1 must hold). */
export const PROPOSAL_NOTE_MAX_CHARS = 600;

/** The two Cohort rungs a proposal can name — the sold ladder (plans-v2), never a pilot tier. */
export type CohortPlanId = "accelerator_starter" | "accelerator_growth";
export const PROPOSAL_PLAN_IDS: readonly CohortPlanId[] = Object.freeze(["accelerator_starter", "accelerator_growth"]);

/** The tracked-startup limit of a Cohort rung (plans.generated usage_limits.profiles — 25 / 100). */
export function cohortPlanCap(id: CohortPlanId): number {
  const row = GENERATED_PLANS_BY_ID[id];
  const cap = row ? (row.usage_limits as Record<string, unknown>).profiles : undefined;
  if (typeof cap !== "number" || cap <= 0) throw new Error(`proposal: plan "${id}" has no profiles limit`);
  return cap;
}

/** Default cohort size when the entry does not say — the smaller rung's cap. */
export const PROPOSAL_DEFAULT_APPLICANTS = cohortPlanCap("accelerator_starter");

export interface CohortProposalOptions {
  /** Generation time; every date derives from it. Defaults to now. */
  now?: Date;
  /** Startups the plan must cover; when absent the entry text is scanned, then the default applies. */
  applicants?: number | null;
  /** The EN catalogue by default; the VI mirror is not offered for proposals (they are signed documents). */
  messages?: Messages;
  /** Who signs for BlockID — role only, never a personal name in a public repo. */
  preparedByRole?: string;
}

export interface ProposalStage {
  n: number;
  window: string;
  headline: string;
  bullets: string[];
}

export interface ProposalTier {
  id: CohortPlanId;
  name: string;
  tagline: string;
  annualLabel: string;
  annualLongLabel: string;
  monthlyLabel: string;
  trialDays: number;
  cap: number;
}

export interface CohortProposal {
  meta: {
    entryId: string;
    reference: string;
    generatedAt: string;
    filename: string;
    planId: CohortPlanId;
  };
  cover: {
    title: string;
    organisation: string;
    contactRole: string;
    dateLabel: string;
    preparedBy: string;
    preparedByRole: string;
    brand: string;
    validUntilLabel: string;
  };
  problem: {
    heading: string;
    lead: string;
    quote: string | null;
    note: string | null;
  };
  scope: {
    heading: string;
    /** "Cohort 25 — annual plan" */
    name: string;
    applicantsCap: number;
    applicantsLine: string;
    /** "A$5,000" — the annual price. */
    priceLabel: string;
    /** "A$5,000 inc. GST" */
    priceLongLabel: string;
    /** "A$500" — the monthly alternative. */
    monthlyLabel: string;
    trialDays: number;
    seats: number;
    reportsPerMonth: number;
    lines: string[];
    includes: string[];
  };
  delivered: { heading: string; lede: string; stages: ProposalStage[] };
  metrics: { heading: string; lede: string; items: string[] };
  timeline: { heading: string; steps: Array<{ label: string; detail: string }>; accessLine: string };
  data: { heading: string; principle: string; consent: string; consentLabel: string; retention: string };
  plans: { heading: string; lede: string; tiers: ProposalTier[] };
  acceptance: { heading: string; text: string; fields: string[] };
  footer: { entity: string; statutory: string; disclaimer: string };
}

/** Smaller counts in free text are people, not an intake; the `?applicants=` override still accepts any size. */
export const MIN_INFERRED_APPLICANTS = 5;

const SIZE_RE = /(\d{1,4})\s*(?:applicants?|startups?|companies|founders|teams|ventures|places)\b|cohorts?\s*(?:of|size)?\s*(\d{1,4})\b|intake\s*(?:of)?\s*(\d{1,4})\b/i;

/** The cohort size the entry text implies (note, objection, next step), or null. Pure. */
export function inferApplicants(entry: Pick<ValidationEntry, "note" | "objection" | "next_step">): number | null {
  for (const text of [entry.note, entry.next_step, entry.objection]) {
    const m = SIZE_RE.exec(text ?? "");
    if (!m) continue;
    const n = Number(m[1] ?? m[2] ?? m[3]);
    // "2 founders" / "3 teams" in a note is not an intake size (review G23 P3).
    if (Number.isInteger(n) && n >= MIN_INFERRED_APPLICANTS) return n;
  }
  return null;
}

/** ≤ the Cohort 25 cap → Cohort 25, otherwise Cohort 100 (larger intakes are scoped on the setup call). */
export function planForApplicants(applicants: number): CohortPlanId {
  return applicants <= cohortPlanCap("accelerator_starter") ? "accelerator_starter" : "accelerator_growth";
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "organisation";
}

export function proposalFilename(organisation: string, now: Date): string {
  return `blockid-cohort-proposal-${slug(organisation)}-${now.toISOString().slice(0, 10)}.pdf`;
}

/** The six-stage workflow from the catalogue — what the accelerator page says ships, never more than the page's promise. */
export function proposalStages(messages: Messages = en as Messages): ProposalStage[] {
  return [1, 2, 3, 4, 5, 6].map((n) => ({
    n,
    window: t(messages, `solutions.accelerator.journey.window${n}`),
    headline: t(messages, `solutions.accelerator.journey.step${n}.head`),
    bullets: [1, 2, 3].map((b) => t(messages, `solutions.accelerator.journey.step${n}.b${b}`)),
  }));
}

function planRow(id: CohortPlanId): Plan {
  const row = PLANS_V2.find((p) => p.id === id);
  if (!row) throw new Error(`proposal: unknown plan "${id}"`);
  return row;
}

function planLimit(id: CohortPlanId, key: "seats" | "reports_per_month"): number {
  const row = GENERATED_PLANS_BY_ID[id];
  const v = row ? (row.usage_limits as Record<string, unknown>)[key] : undefined;
  return typeof v === "number" && v > 0 ? v : 0;
}

function tier(id: CohortPlanId): ProposalTier {
  const row = planRow(id);
  const annual = row.annual_aud ?? 0;
  return {
    id,
    name: row.name,
    tagline: row.tagline ?? "",
    annualLabel: formatAud(annual),
    annualLongLabel: withGst(formatAud(annual)),
    monthlyLabel: formatAud(row.monthly_aud ?? 0),
    trialDays: row.trial_days,
    cap: cohortPlanCap(id),
  };
}

/**
 * Build the proposal document model for a tracker entry. Pure: the same
 * entry + `now` always yields the same model. The rung follows the cohort
 * size the entry implies (`opts.applicants` → the entry text → the Cohort 25
 * cap): ≤ 25 startups proposes Cohort 25, anything larger Cohort 100.
 */
export function buildCohortProposal(entry: ValidationEntry, opts: CohortProposalOptions = {}): CohortProposal {
  const now = opts.now ?? new Date();
  const messages = opts.messages ?? (en as Messages);
  const applicants = opts.applicants && opts.applicants > 0 ? Math.floor(opts.applicants) : (inferApplicants(entry) ?? PROPOSAL_DEFAULT_APPLICANTS);
  const planId = planForApplicants(applicants);
  const plan = tier(planId);
  const validUntil = addDays(now, PROPOSAL_VALID_DAYS);
  const trialEnds = addDays(now, plan.trialDays);
  const organisation = entry.organisation.trim();
  const contactRole = entry.contact_role.trim();
  const objection = entry.objection.trim();
  const rawNote = entry.note.trim();
  const note = rawNote.length > PROPOSAL_NOTE_MAX_CHARS ? `${rawNote.slice(0, PROPOSAL_NOTE_MAX_CHARS - 1).trimEnd()}…` : rawNote;
  const preparedByRole = opts.preparedByRole ?? "Founder";
  const seats = planLimit(planId, "seats");
  const reportsPerMonth = planLimit(planId, "reports_per_month");

  return {
    meta: {
      entryId: entry.id,
      reference: `CP-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${entry.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      generatedAt: now.toISOString(),
      filename: proposalFilename(organisation, now),
      planId,
    },
    cover: {
      title: PROPOSAL_TITLE,
      organisation,
      contactRole,
      dateLabel: fmtDay(now),
      preparedBy: legalLine(),
      preparedByRole,
      brand: BRAND_SITE,
      validUntilLabel: fmtDay(validUntil),
    },
    problem: {
      heading: "The problem, in your words",
      lead: `What we heard from ${organisation}${contactRole ? ` (${contactRole})` : ""} on ${entry.date}:`,
      quote: objection || null,
      note: note || null,
    },
    // scope — the rung's size, price and what it includes (constants only)
    scope: {
      heading: "Scope and price",
      name: `${plan.name} — annual plan`,
      applicantsCap: plan.cap,
      applicantsLine: `Up to ${plan.cap} tracked startups`,
      priceLabel: plan.annualLabel,
      priceLongLabel: plan.annualLongLabel,
      monthlyLabel: plan.monthlyLabel,
      trialDays: plan.trialDays,
      seats,
      reportsPerMonth,
      lines: [
        t(messages, "solutions.accelerator.cohort.lede"),
        `${plan.annualLongLabel} a year, billed annually — or ${plan.monthlyLabel} a month. Starts with a ${plan.trialDays}-day free trial, card required; cancel in the billing portal before day ${plan.trialDays + 1} and nothing is charged. ATO tax invoice issued by ${LEGAL_ENTITY.operator}.`,
        `${seats} evaluator seats and ${reportsPerMonth} Trusted Business Reports a month included.`,
        applicants > plan.cap ? `Your intake of about ${applicants} is larger than this rung tracks; the setup call scopes the remainder (Cohort Enterprise) before anything is charged.` : `Sized for an intake of about ${applicants}.`,
      ],
      includes: [...COHORT_INCLUDES],
    },
    delivered: {
      heading: t(messages, "solutions.accelerator.journey.title"),
      lede: t(messages, "solutions.accelerator.journey.lede"),
      stages: proposalStages(messages),
    },
    metrics: {
      heading: t(messages, "solutions.accelerator.cohort.metricsTitle"),
      lede: t(messages, "solutions.accelerator.cohort.metricsLede"),
      items: [...COHORT_SUCCESS_METRICS],
    },
    timeline: {
      heading: "Timeline",
      steps: [
        { label: "Acceptance", detail: `Signed acceptance returned — this proposal is valid until ${fmtDay(validUntil)}.` },
        { label: "Trial", detail: `Sign-up starts the ${plan.trialDays}-day free trial (card required, nothing billed until it ends); the Cohort onboarding kit opens in the workspace.` },
        { label: "Setup", detail: "Setup call with your review team: success metrics agreed, intake link published or the existing cohort imported as CSV." },
        { label: "Intake", detail: "Applications arrive through your intake link; each founder gives consent on submission." },
        { label: "Assessment", detail: "Every applicant assessed on one rubric with evidence confidence; the cohort table and top gaps are live for the committee." },
        { label: "Workshop", detail: "Feedback workshop with your review team; consistency and satisfaction captured." },
        { label: "Report", detail: "Cohort Report for the program and its sponsors; the metrics are read together and the renewal decision is yours." },
      ],
      accessLine: `The plan runs 12 months from the first invoice; a trial started today ends on ${fmtDay(trialEnds)}.`,
    },
    data: {
      heading: "Data and consent",
      principle: DATA_PRINCIPLE_SENTENCE,
      consent: APPLICANT_CONSENT_TEXT,
      consentLabel: APPLICANT_CONSENT_LABEL,
      retention: PROPOSAL_RETENTION_LINE,
    },
    plans: {
      heading: t(messages, "solutions.accelerator.plans.title"),
      lede: t(messages, "solutions.accelerator.plans.lede"),
      tiers: PROPOSAL_PLAN_IDS.map(tier),
    },
    acceptance: {
      heading: "Acceptance",
      text: `${organisation} accepts ${plan.name} (annual) at ${plan.annualLongLabel} a year on the scope, metrics and data terms above. ${LEGAL_ENTITY.operator} (${BRAND_SITE}) delivers the plan as described. The trial starts from the sign-up link we send on acceptance; the first annual invoice is raised by Stripe when the trial ends, or by invoice on request.`,
      fields: ["Name", "Role", "Organisation", "Date", "Signature"],
    },
    footer: {
      entity: `${legalLine()} · ${LEGAL_ENTITY.city}`,
      statutory: statutoryLine(),
      disclaimer: PDF_GENERAL_ADVICE_DISCLAIMER,
    },
  };
}

/** Every catalogue key the builder reads — pinned by the test so a renamed key can't slip through as its own name. */
export const PROPOSAL_CATALOGUE_KEYS: readonly string[] = Object.freeze([
  "solutions.accelerator.journey.title",
  "solutions.accelerator.journey.lede",
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`solutions.accelerator.journey.window${n}`, `solutions.accelerator.journey.step${n}.head`, `solutions.accelerator.journey.step${n}.b1`, `solutions.accelerator.journey.step${n}.b2`, `solutions.accelerator.journey.step${n}.b3`]),
  "solutions.accelerator.cohort.lede",
  "solutions.accelerator.cohort.metricsTitle",
  "solutions.accelerator.cohort.metricsLede",
  "solutions.accelerator.plans.title",
  "solutions.accelerator.plans.lede",
]);

/** The two Cohort rungs the plans table lists — pinned by the test against plans-v2. */
export const PROPOSAL_TIER_IDS: readonly CohortPlanId[] = PROPOSAL_PLAN_IDS;
