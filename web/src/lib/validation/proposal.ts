// validation/proposal — the written pilot proposal (G23-B, 2026-09-21).
//
// The advisor plan's validation Level 3 is "two written pilot proposals with
// scope, price and dates sent to a named organisation". This module turns a
// validation-tracker entry (organisation, contact role, the objection in
// their words, the note) into the document model the react-pdf template
// (lib/pdf/pilot-proposal-pdf.tsx) renders on demand from
// GET /api/admin/validation/[id]/proposal. Nothing is stored except the
// `proposal_generated_at` stamp on the entry.
//
// Rules that bind this file:
//   • every number is a constant — the pilot amounts / caps / access days
//     from lib/pricing/pilot-skus.ts, the annual Cohort prices from
//     lib/plans-v2.ts, the credit window from lib/pilots/conversion.ts, the
//     retention line from the privacy policy § 4;
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
import { formatAud, withGst } from "@/lib/plans-v2";
import { PILOT_CONVERSION_WINDOW_DAYS, PILOT_CREDIT_RULE, conversionPlan, type ConversionPlanId } from "@/lib/pilots/conversion";
import { APPLICANT_CONSENT_LABEL, APPLICANT_CONSENT_TEXT, DATA_PRINCIPLE_SENTENCE } from "@/lib/pilots/consent";
import { PDF_GENERAL_ADVICE_DISCLAIMER } from "@/lib/pdf/advice-disclaimer";
import { PILOT_ENTITLEMENT_DAYS, PILOT_INCLUDES, PILOT_SKUS, PILOT_SUCCESS_METRICS, formatPilotPrice, formatPilotPriceLong, type PilotSkuId } from "@/lib/pricing/pilot-skus";
import { BRAND_SITE, LEGAL_ENTITY, legalLine, statutoryLine } from "@/lib/site/legal-entity";
import type { ValidationEntry } from "./model";

export const PROPOSAL_TITLE = "Cohort Validation Pilot — proposal";

/** The retention line, verbatim from the privacy policy § 4 (content/legal/privacy-v2.mdx). */
export const PROPOSAL_RETENTION_LINE =
  "Startups entered by evaluators, evaluation reports and batches are kept for the life of the evaluator account, or until the evaluator deletes the record, or on request from the founder (Privacy Policy § 4).";

/** How long the quoted price holds — the acceptance line prints the date. */
export const PROPOSAL_VALID_DAYS = 30;

/** The entry note is founder shorthand; the proposal quotes at most this many characters of it (page 1 must hold). */
export const PROPOSAL_NOTE_MAX_CHARS = 600;

/** Default cohort size when the entry does not say — the smaller pilot. */
export const PROPOSAL_DEFAULT_APPLICANTS = PILOT_SKUS.cohort_pilot_25.applicantsCap;

export interface PilotProposalOptions {
  /** Generation time; every date derives from it. Defaults to now. */
  now?: Date;
  /** Applicants the pilot must cover; when absent the entry text is scanned, then the default applies. */
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
  id: ConversionPlanId;
  name: string;
  tagline: string;
  annualLabel: string;
  annualLongLabel: string;
  monthlyLabel: string;
  trialDays: number;
}

export interface PilotProposal {
  meta: {
    entryId: string;
    reference: string;
    generatedAt: string;
    filename: string;
    sku: PilotSkuId;
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
    name: string;
    applicantsCap: number;
    applicantsLine: string;
    priceLabel: string;
    priceLongLabel: string;
    accessDays: number;
    lines: string[];
    includes: string[];
  };
  delivered: { heading: string; lede: string; stages: ProposalStage[] };
  metrics: { heading: string; lede: string; items: string[] };
  timeline: { heading: string; steps: Array<{ label: string; detail: string }>; accessLine: string };
  data: { heading: string; principle: string; consent: string; consentLabel: string; retention: string };
  after: { heading: string; lede: string; tiers: ProposalTier[]; creditRule: string; windowDays: number };
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

/** ≤ 25 → the 25 pilot, otherwise the 50 pilot (larger intakes are scoped on the setup call). */
export function skuForApplicants(applicants: number): PilotSkuId {
  return applicants <= PILOT_SKUS.cohort_pilot_25.applicantsCap ? "cohort_pilot_25" : "cohort_pilot_50";
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
  return `blockid-pilot-proposal-${slug(organisation)}-${now.toISOString().slice(0, 10)}.pdf`;
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

function tier(id: ConversionPlanId): ProposalTier {
  const row = conversionPlan(id);
  const annual = row.annual_aud ?? 0;
  return {
    id,
    name: row.name,
    tagline: row.tagline ?? "",
    annualLabel: formatAud(annual),
    annualLongLabel: withGst(formatAud(annual)),
    monthlyLabel: formatAud(row.monthly_aud ?? 0),
    trialDays: row.trial_days,
  };
}

/**
 * Build the proposal document model for a tracker entry. Pure: the same
 * entry + `now` always yields the same model. The price and cap follow the
 * cohort size the entry implies (`opts.applicants` → the entry text →
 * the 25 default); ≤ 25 applicants books the 25 pilot, anything larger the
 * 50 pilot.
 */
export function buildPilotProposal(entry: ValidationEntry, opts: PilotProposalOptions = {}): PilotProposal {
  const now = opts.now ?? new Date();
  const messages = opts.messages ?? (en as Messages);
  const applicants = opts.applicants && opts.applicants > 0 ? Math.floor(opts.applicants) : (inferApplicants(entry) ?? PROPOSAL_DEFAULT_APPLICANTS);
  const skuId = skuForApplicants(applicants);
  const sku = PILOT_SKUS[skuId];
  const validUntil = addDays(now, PROPOSAL_VALID_DAYS);
  const accessEnds = addDays(now, PILOT_ENTITLEMENT_DAYS);
  const organisation = entry.organisation.trim();
  const contactRole = entry.contact_role.trim();
  const objection = entry.objection.trim();
  const rawNote = entry.note.trim();
  const note = rawNote.length > PROPOSAL_NOTE_MAX_CHARS ? `${rawNote.slice(0, PROPOSAL_NOTE_MAX_CHARS - 1).trimEnd()}…` : rawNote;
  const preparedByRole = opts.preparedByRole ?? "Founder";

  return {
    meta: {
      entryId: entry.id,
      reference: `PP-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${entry.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      generatedAt: now.toISOString(),
      filename: proposalFilename(organisation, now),
      sku: skuId,
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
    // scope — the pilot's size, price and what it includes (constants only)
    scope: {
      heading: "Scope and price",
      name: sku.name,
      applicantsCap: sku.applicantsCap,
      applicantsLine: t(messages, "solutions.accelerator.pilot.applicants").replace("{n}", String(sku.applicantsCap)),
      priceLabel: formatPilotPrice(skuId),
      priceLongLabel: formatPilotPriceLong(skuId),
      accessDays: sku.entitlementDays,
      lines: [
        t(messages, "solutions.accelerator.pilot.lede"),
        t(messages, "solutions.accelerator.pilot.scope"),
        `One-off ${formatPilotPriceLong(skuId)} — quoted here, charged once, with an ATO tax invoice issued by ${LEGAL_ENTITY.operator}. No subscription starts unless you choose a Cohort plan afterwards.`,
        applicants > sku.applicantsCap ? `Your intake of about ${applicants} is larger than this pilot covers; the setup call scopes the remainder before anything is charged.` : `Sized for an intake of about ${applicants}.`,
      ],
      includes: [...PILOT_INCLUDES],
    },
    delivered: {
      heading: t(messages, "solutions.accelerator.journey.title"),
      lede: t(messages, "solutions.accelerator.journey.lede"),
      stages: proposalStages(messages),
    },
    metrics: {
      heading: t(messages, "solutions.accelerator.pilot.metricsTitle"),
      lede: t(messages, "solutions.accelerator.pilot.metricsLede"),
      items: [...PILOT_SUCCESS_METRICS],
    },
    timeline: {
      heading: "Timeline",
      steps: [
        { label: "Acceptance", detail: `Signed acceptance returned and the pilot paid — this proposal is valid until ${fmtDay(validUntil)}.` },
        { label: "Setup", detail: "Setup call with your review team: success metrics agreed, intake link published or the existing cohort imported as CSV." },
        { label: "Intake", detail: "Applications arrive through your intake link; each founder gives consent on submission." },
        { label: "Assessment", detail: "Every applicant assessed on one rubric with evidence confidence; the cohort table and top gaps are live for the committee." },
        { label: "Workshop", detail: "Feedback workshop with your review team; consistency and satisfaction captured." },
        { label: "Report", detail: "Final cohort report for the program and its sponsors; the metrics are read together and the Cohort plan decision is yours." },
      ],
      accessLine: `Workspace access runs ${PILOT_ENTITLEMENT_DAYS} days from payment (to ${fmtDay(accessEnds)} if paid today).`,
    },
    data: {
      heading: "Data and consent",
      principle: DATA_PRINCIPLE_SENTENCE,
      consent: APPLICANT_CONSENT_TEXT,
      consentLabel: APPLICANT_CONSENT_LABEL,
      retention: PROPOSAL_RETENTION_LINE,
    },
    after: {
      heading: t(messages, "solutions.accelerator.after.title"),
      lede: t(messages, "solutions.accelerator.after.lede"),
      tiers: [tier("accelerator_starter"), tier("accelerator_growth")],
      creditRule: PILOT_CREDIT_RULE,
      windowDays: PILOT_CONVERSION_WINDOW_DAYS,
    },
    acceptance: {
      heading: "Acceptance",
      text: `${organisation} accepts the ${sku.name} at ${formatPilotPriceLong(skuId)} on the scope, metrics and data terms above. ${LEGAL_ENTITY.operator} (${BRAND_SITE}) delivers the pilot as described. Payment is by the secure checkout link we send on acceptance, or by invoice on request.`,
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
  "solutions.accelerator.pilot.applicants",
  "solutions.accelerator.pilot.lede",
  "solutions.accelerator.pilot.scope",
  "solutions.accelerator.pilot.metricsTitle",
  "solutions.accelerator.pilot.metricsLede",
  "solutions.accelerator.after.title",
  "solutions.accelerator.after.lede",
]);

/** The two Cohort rungs the after-pilot table lists — pinned by the test against plans-v2. */
export const PROPOSAL_TIER_IDS: readonly ConversionPlanId[] = Object.freeze(["accelerator_starter", "accelerator_growth"]);
