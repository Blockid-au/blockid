/**
 * Sprocketbay process walkthrough — the typed fixture behind
 * `/showcase/sprocketbay`.
 *
 * WHAT THIS IS
 * ------------
 * `/showcase/atlassian/*` answers "what does a company that already made
 * it look like?" using a real listed company and its public filings.
 * This module answers the opposite question: "if I walk BlockID's own
 * process from day zero, what do I actually produce at each step?"
 *
 * The subject is `Sprocketbay Demo Co (Sample Profile)` — the fictional
 * company seeded by migration 0299 and published at `/id/sprocketbay-demo`
 * with `profile_kind = 'demo'`. It is NOT a real business (see
 * `SPROCKETBAY_SAMPLE_NOTICE` and `@/lib/business-id/profile-disclosure`).
 *
 * WHAT IS FIXTURE AND WHAT IS COMPUTED
 * ------------------------------------
 * Only the *inputs* are authored here:
 *   - the artefacts the founder produced (title, area, evidence category,
 *     dates, the transition path its evidence row walked),
 *   - the answers they gave to the 13 SVI criteria (text, file/link counts
 *     and the AI score each answer earned),
 *   - the verification signals that were true at the end of each stage.
 *
 * Every number the walkthrough *shows* comes back out of the real engines:
 *   - `computeQuality()`            → the criterion quality ladder
 *   - `CRITERIA[].weight`           → the 100-point weighted composite
 *   - `computeVerificationLevel()`  → the 0–5 ladder rung
 *   - `computeStageProgress()`      → canAdvance / onTrack / blockers
 *   - `nextEvidenceState()`         → every artefact's verification state
 *
 * `journey.test.ts` pins that: it recomputes each of the above from the
 * fixture and compares against the framework catalogues and against the
 * values migration 0299 stored on the profile row.
 *
 * RECONCILIATION WITH THE STORED PROFILE
 * --------------------------------------
 * See `SPROCKETBAY_RECONCILIATION` below — three points where the fixture
 * had to line up with data that already exists in the database, and the
 * one place where the ladder engine and the "no ABN" rule genuinely pull
 * in opposite directions.
 *
 * Pure module — no React, no I/O, no Supabase. Safe to import anywhere.
 */

import {
  CRITERIA,
  CRITERION_KEYS,
  computeQuality,
  type CriterionKey,
  type QualityLevel,
} from "@/lib/evaluation-criteria";
import {
  nextEvidenceState,
  type EvidenceState,
  type EvidenceTransition,
} from "@/lib/evidence/state-machine";
import {
  computeStageProgress,
  getStage,
  UNICORN_STAGE_IDS,
  type ComputeResult,
  type UnicornStage,
  type UnicornStageId,
} from "@/lib/unicorn/framework";
import {
  computeVerificationLevel,
  type VerificationInputs,
  type VerificationLevel,
} from "@/lib/verification/level-engine";
import { growthPhaseToStageLabel } from "@/lib/journey-map";
import {
  GROWTH_PHASE_LABELS,
  type GrowthPhaseId,
} from "@/lib/growth/phase-taxonomy";
// The 12 analysis areas / 4 pillars of Master Upgrade Plan §6 have exactly
// one in-code home: `showcase/atlassian/stage-benchmark.ts`. Importing it
// (rather than re-declaring the list here) is deliberate — a rename or a
// re-weighting there must break this fixture's test rather than silently
// orphan every artefact's `analysisArea`. Nothing in that module is
// mutated; this is a read-only dependency on the framework catalogue.
import {
  ANALYSIS_AREAS,
  type AnalysisAreaId,
} from "@/lib/showcase/atlassian/stage-benchmark";

// ─── Sample-data notice ─────────────────────────────────────────────

/**
 * The one-liner every surface built on this fixture must carry near the
 * figures themselves (the full disclosure banner comes from
 * `profile-disclosure.ts` and is rendered above the fold).
 */
export const SPROCKETBAY_SAMPLE_NOTICE =
  "SAMPLE DATA — Sprocketbay Demo Co is a fictional company invented by BlockID.au to demonstrate its own process end to end. It is not a real trading entity, it holds no ABN, and every artefact, date, score and attester below is an illustrative fixture rather than the record of a real verification.";

/** Slug of the public profile this walkthrough narrates. */
export const SPROCKETBAY_PROFILE_SLUG = "sprocketbay-demo";

/** Legal name exactly as migration 0299 stores it. */
export const SPROCKETBAY_LEGAL_NAME = "Sprocketbay Demo Co (Sample Profile)";

/**
 * The date the walkthrough is written "as at". Matches
 * `projects.last_verified_at` in migration 0299, so days-in-stage,
 * evidence expiry and the ladder rung are all read at the same instant.
 */
export const SPROCKETBAY_AS_AT = "2026-07-20";

/** Day zero of the fictional arc. */
export const SPROCKETBAY_FOUNDED_ON = "2024-02-05";

// ─── Evidence categories (migration 0210) ───────────────────────────

/**
 * The evidence category vocabulary declared in
 * `supabase/migrations/0210_evidence.sql`. The column is open text there
 * (deliberately — a new category must not need a schema migration), so
 * the canonical list lives only in that file's comment. Mirrored here so
 * artefacts are type-checked, and `journey.test.ts` re-parses the SQL to
 * prove the mirror has not drifted.
 */
export const EVIDENCE_CATEGORIES = [
  "identity",
  "governance",
  "financial",
  "product",
  "traction",
  "compliance",
  "ip",
  "people",
  "esg",
  "security",
  "contract",
  "other",
] as const;
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

// ─── Stage coverage areas (migration 0280 / UNICORN_STAGES) ─────────

/**
 * The `mandatory_areas` vocabulary the unicorn framework gates stage exit
 * on. Distinct from the §6 analysis areas above — this list is about
 * *evidence coverage*, that one is about *assessment scope*. Derived from
 * the catalogue rather than retyped, so it cannot drift.
 */
export const STAGE_COVERAGE_AREAS: readonly string[] = Array.from(
  new Set(UNICORN_STAGE_IDS.flatMap((id) => getStage(id).mandatoryAreas)),
).sort();

// ─── Artefact ───────────────────────────────────────────────────────

/**
 * One thing the founder produced. Every field is either a link into a
 * framework catalogue (so a rename breaks the test) or a plausible,
 * internally-consistent illustrative value.
 */
export interface SprocketbayArtefact {
  /** Stable id — also the seed key for the evidence row's synthetic hash. */
  id: string;
  title: string;
  /** One-line "what the founder actually did to produce this". */
  producedBy: string;
  /** Which of the Master Plan §6 analysis areas this artefact feeds. */
  analysisArea: AnalysisAreaId;
  /**
   * The SVI criterion the area maps to, or null where no criterion
   * honestly covers it. MUST equal `ANALYSIS_AREAS[analysisArea].criterion`
   * — it is a denormalised read, never an independent claim.
   */
  criterion: CriterionKey | null;
  /** `public.evidence.category` (migration 0210). */
  evidenceCategory: EvidenceCategory;
  /**
   * Which unicorn-framework coverage areas this artefact satisfies.
   * May be empty — plenty of useful artefacts gate no stage exit.
   */
  stageCoverage: readonly string[];
  /** `public.evidence.issued_at`. */
  issuedAt: string;
  /** `public.evidence.expires_at`, or null for documents that do not lapse. */
  expiresAt: string | null;
  /**
   * The transition path the evidence row walked from `uploaded`. Replayed
   * through `nextEvidenceState()` in the test; `state` is the result.
   */
  transitions: readonly EvidenceTransition[];
  /** Terminal state as at `SPROCKETBAY_AS_AT`. */
  state: EvidenceState;
  /** Data-room folder name from `DATA_ROOM_STRUCTURE`. */
  dataRoomFolder: string;
  /** Document name inside that folder, from `DATA_ROOM_STRUCTURE`. */
  dataRoomDocument: string;
  contentType: string;
  sizeBytes: number;
  sensitivity: "public" | "private" | "restricted" | "highly_sensitive";
}

// Transition shorthands — the three paths every artefact here takes.
const AUTO_VERIFIED: readonly EvidenceTransition[] = [
  "start_processing",
  "extraction_complete",
  "classify_high_confidence",
];
const HUMAN_VERIFIED: readonly EvidenceTransition[] = [
  "start_processing",
  "extraction_complete",
  "classify_low_confidence",
  "human_approve",
];
const IN_HUMAN_REVIEW: readonly EvidenceTransition[] = [
  "start_processing",
  "extraction_complete",
  "classify_low_confidence",
];
const SUPERSEDED: readonly EvidenceTransition[] = [
  "start_processing",
  "extraction_complete",
  "classify_high_confidence",
  "expire",
  "archive",
];

// ─── Criterion answer ───────────────────────────────────────────────

/**
 * What the founder had recorded against one of the 13 criteria at the end
 * of a given stage. `quality` is NOT stored — `computeQuality()` derives
 * it from these fields.
 */
export interface SprocketbayCriterionAnswer {
  criterion: CriterionKey;
  /** The founder's written answer (length matters to `computeQuality`). */
  answer: string;
  fileCount: number;
  linkCount: number;
  /** `evaluation_criteria.ai_score` — 0..100. */
  score: number;
}

// ─── Stage ──────────────────────────────────────────────────────────

export interface SprocketbayStage {
  stage: UnicornStageId;
  /** The growth phases (12-phase string taxonomy) walked inside this stage. */
  phases: readonly GrowthPhaseId[];
  enteredOn: string;
  /** null for the stage the company is still in. */
  exitedOn: string | null;
  /** Days spent in the stage as at `exitedOn` (or `SPROCKETBAY_AS_AT`). */
  daysInStage: number;
  /** What the founder did, in their own frame. */
  narrative: string;
  artefacts: readonly SprocketbayArtefact[];
  /** Answers as at the END of this stage (cumulative, not incremental). */
  answers: readonly SprocketbayCriterionAnswer[];
  /** Verification signals true at the END of this stage. */
  verification: VerificationInputs;
  /** Unresolved critical assessment findings at the end of the stage. */
  openCriticalFindings: number;
}

// ─── The fixture ────────────────────────────────────────────────────
//
// Criterion answers are cumulative snapshots: each stage lists every
// criterion that had *any* content by the end of that stage. Scores are
// monotonically non-decreasing across stages (the test pins that) because
// a founder does not un-learn — the only way a criterion score falls in
// the real product is evidence expiry, which this arc does not model.

function answer(
  criterion: CriterionKey,
  score: number,
  fileCount: number,
  linkCount: number,
  text: string,
): SprocketbayCriterionAnswer {
  return { criterion, score, fileCount, linkCount, answer: text };
}

const S0_ARTEFACTS: readonly SprocketbayArtefact[] = [
  {
    id: "sb-a01-founder-id",
    title: "Founder identity check — lead founder (sample)",
    producedBy:
      "Completed the identity step in onboarding: government-ID capture plus a liveness check, then confirmed the account email.",
    analysisArea: "founder_leadership",
    criterion: "founder_profile",
    evidenceCategory: "identity",
    stageCoverage: ["identity"],
    issuedAt: "2024-02-06",
    expiresAt: "2029-02-06",
    transitions: AUTO_VERIFIED,
    state: "verified",
    dataRoomFolder: "6. Team & Advisors",
    dataRoomDocument: "Founder Profiles",
    contentType: "application/pdf",
    sizeBytes: 412_308,
    sensitivity: "highly_sensitive",
  },
  {
    id: "sb-a02-cert-registration",
    title: "Certificate of Registration (sample)",
    producedBy:
      "Uploaded the incorporation certificate issued when the Pty Ltd was registered.",
    analysisArea: "governance_risk_compliance",
    criterion: "documents",
    evidenceCategory: "governance",
    stageCoverage: ["identity", "ownership"],
    issuedAt: "2024-02-07",
    expiresAt: null,
    transitions: AUTO_VERIFIED,
    state: "verified",
    dataRoomFolder: "1. Corporate & Legal",
    dataRoomDocument: "Certificate of Registration",
    contentType: "application/pdf",
    sizeBytes: 188_442,
    sensitivity: "private",
  },
  {
    id: "sb-a03-founder-vesting",
    title: "Founder agreements & vesting schedules (sample)",
    producedBy:
      "Signed founder agreements with a 4-year vest and a 12-month cliff before any code was written.",
    analysisArea: "founder_leadership",
    criterion: "founder_profile",
    evidenceCategory: "governance",
    stageCoverage: ["ownership"],
    issuedAt: "2024-02-09",
    expiresAt: null,
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "2. Cap Table & Equity",
    dataRoomDocument: "Founder Agreements & Vesting Schedules",
    contentType: "application/pdf",
    sizeBytes: 640_115,
    sensitivity: "restricted",
  },
  {
    id: "sb-a04-discovery-log",
    title: "Customer discovery interview log — 14 interviews (sample)",
    producedBy:
      "Ran 14 recorded discovery calls with platform engineers and wrote up the pain points that repeated in more than half of them.",
    analysisArea: "competitive_positioning",
    criterion: "market",
    evidenceCategory: "traction",
    stageCoverage: [],
    issuedAt: "2024-02-16",
    expiresAt: null,
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "5. Market & Traction",
    dataRoomDocument: "Customer Discovery Interview Log",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 96_770,
    sensitivity: "private",
  },
];

const S1_ARTEFACTS: readonly SprocketbayArtefact[] = [
  {
    id: "sb-a05-constitution",
    title: "Constitution / replaceable rules adoption (sample)",
    producedBy:
      "Adopted a constitution instead of the replaceable rules so the share classes and pre-emption terms were settled before the first hire.",
    analysisArea: "governance_risk_compliance",
    criterion: "documents",
    evidenceCategory: "governance",
    stageCoverage: ["governance"],
    issuedAt: "2024-02-22",
    expiresAt: null,
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "1. Corporate & Legal",
    dataRoomDocument: "Constitution or Replaceable Rules",
    contentType: "application/pdf",
    sizeBytes: 1_204_882,
    sensitivity: "private",
  },
  {
    id: "sb-a06-directors-register",
    title: "Register of directors & secretaries (sample)",
    producedBy:
      "Recorded both directors and the company secretary, with consents to act attached.",
    analysisArea: "governance_risk_compliance",
    criterion: "documents",
    evidenceCategory: "governance",
    stageCoverage: ["governance"],
    issuedAt: "2024-02-23",
    expiresAt: "2027-02-23",
    transitions: AUTO_VERIFIED,
    state: "verified",
    dataRoomFolder: "1. Corporate & Legal",
    dataRoomDocument: "Register of Directors & Secretaries",
    contentType: "application/pdf",
    sizeBytes: 74_930,
    sensitivity: "private",
  },
  {
    id: "sb-a07-financial-model",
    title: "Financial model — 3-year projection v1 (sample)",
    producedBy:
      "Built the first bottom-up model: seats × price × conversion, with the cost base driven off headcount rather than a growth percentage.",
    analysisArea: "financial_health",
    criterion: null,
    evidenceCategory: "financial",
    stageCoverage: ["finance_baseline"],
    issuedAt: "2024-03-05",
    expiresAt: "2025-03-05",
    transitions: SUPERSEDED,
    state: "archived",
    dataRoomFolder: "3. Financial Projections",
    dataRoomDocument: "Financial Model (3-Year Projection)",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 2_338_104,
    sensitivity: "restricted",
  },
  {
    id: "sb-a08-domain-control",
    title: "Domain control verification record (sample)",
    producedBy:
      "Proved control of the primary domain with a DNS TXT record, which is what moves the ladder past self-declared.",
    analysisArea: "website_digital_presence",
    criterion: "website",
    evidenceCategory: "identity",
    stageCoverage: ["identity"],
    issuedAt: "2024-03-09",
    expiresAt: "2027-03-09",
    transitions: AUTO_VERIFIED,
    state: "verified",
    dataRoomFolder: "7. IP & Compliance",
    dataRoomDocument: "Domain Name Register",
    contentType: "application/json",
    sizeBytes: 4_512,
    sensitivity: "private",
  },
  {
    id: "sb-a09-tech-architecture",
    title: "Technical architecture note — MVP (sample)",
    producedBy:
      "Wrote down the MVP architecture, the data model and the two decisions that would be expensive to reverse later.",
    analysisArea: "technology_architecture",
    criterion: "code_git",
    evidenceCategory: "product",
    stageCoverage: ["product"],
    issuedAt: "2024-03-20",
    expiresAt: null,
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "4. Product & Technology",
    dataRoomDocument: "Technical Architecture",
    contentType: "application/pdf",
    sizeBytes: 883_401,
    sensitivity: "restricted",
  },
  {
    id: "sb-a10-pitch-deck-v1",
    title: "Pitch deck v1 (sample)",
    producedBy:
      "Assembled the first deck — problem, wedge, the 14 interviews, and an explicit note that there was no revenue yet.",
    analysisArea: "governance_risk_compliance",
    criterion: "documents",
    evidenceCategory: "other",
    stageCoverage: [],
    issuedAt: "2024-04-02",
    expiresAt: null,
    transitions: SUPERSEDED,
    state: "archived",
    dataRoomFolder: "1. Corporate & Legal",
    dataRoomDocument: "Pitch Deck",
    contentType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sizeBytes: 14_882_003,
    sensitivity: "private",
  },
];

const S2_ARTEFACTS: readonly SprocketbayArtefact[] = [
  {
    id: "sb-a11-revenue-proof",
    title: "Revenue proof — payment processor export (sample)",
    producedBy:
      "Connected the payment processor and exported the first two quarters of settled invoices rather than typing MRR into a slide.",
    analysisArea: "revenue_model_sales",
    criterion: "revenue",
    evidenceCategory: "financial",
    stageCoverage: ["revenue"],
    issuedAt: "2024-05-08",
    expiresAt: "2025-05-08",
    transitions: SUPERSEDED,
    state: "archived",
    dataRoomFolder: "3. Financial Projections",
    dataRoomDocument: "Revenue Proof (Stripe / Bank)",
    contentType: "text/csv",
    sizeBytes: 331_776,
    sensitivity: "restricted",
  },
  {
    id: "sb-a12-gtm-strategy",
    title: "Go-to-market strategy — self-serve motion (sample)",
    producedBy:
      "Documented the low-touch motion: docs-led acquisition, no outbound team, and the two channels that were allowed to consume budget.",
    analysisArea: "gtm_strategy",
    criterion: "gtm_strategy",
    evidenceCategory: "other",
    stageCoverage: ["gtm"],
    issuedAt: "2024-05-22",
    expiresAt: null,
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "9. Strategy & Roadmap",
    dataRoomDocument: "Go-to-Market Strategy",
    contentType: "application/pdf",
    sizeBytes: 1_776_210,
    sensitivity: "private",
  },
  {
    id: "sb-a13-customer-concentration",
    title: "Top-20 customer revenue concentration (sample)",
    producedBy:
      "Pulled revenue by account to check whether the self-serve motion had quietly become dependent on a handful of logos.",
    analysisArea: "business_performance_kpis",
    criterion: null,
    evidenceCategory: "traction",
    stageCoverage: ["customers"],
    issuedAt: "2024-06-14",
    expiresAt: "2025-06-14",
    transitions: SUPERSEDED,
    state: "archived",
    dataRoomFolder: "5. Market & Traction",
    dataRoomDocument: "Top-20 Customer Revenue Concentration",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 148_992,
    sensitivity: "restricted",
  },
  {
    id: "sb-a14-shareholders-agreement",
    title: "Shareholders agreement (sample)",
    producedBy:
      "Executed a shareholders agreement covering drag/tag, reserved matters and what happens if a founder leaves.",
    analysisArea: "governance_risk_compliance",
    criterion: "documents",
    evidenceCategory: "contract",
    stageCoverage: ["ownership", "governance"],
    issuedAt: "2024-06-27",
    expiresAt: null,
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "2. Cap Table & Equity",
    dataRoomDocument: "Shareholders Agreement",
    contentType: "application/pdf",
    sizeBytes: 2_105_664,
    sensitivity: "restricted",
  },
  {
    id: "sb-a15-esop-rules",
    title: "ESOP plan rules (sample)",
    producedBy:
      "Adopted an option plan before the fifth hire so equity conversations stopped being bespoke.",
    analysisArea: "hr_organisation",
    criterion: "team_structure",
    evidenceCategory: "people",
    stageCoverage: ["people"],
    issuedAt: "2024-07-30",
    expiresAt: null,
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "2. Cap Table & Equity",
    dataRoomDocument: "ESOP Plan Rules",
    contentType: "application/pdf",
    sizeBytes: 1_442_300,
    sensitivity: "restricted",
  },
  {
    id: "sb-a16-unit-economics",
    title: "Unit economics model — LTV / CAC (sample)",
    producedBy:
      "Replaced the blended CAC guess with a cohort-derived payback period, which changed the pricing decision.",
    analysisArea: "financial_health",
    criterion: null,
    evidenceCategory: "financial",
    stageCoverage: ["finance_baseline", "revenue"],
    issuedAt: "2024-08-15",
    expiresAt: "2025-08-15",
    transitions: SUPERSEDED,
    state: "archived",
    dataRoomFolder: "3. Financial Projections",
    dataRoomDocument: "Unit Economics Model",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 671_744,
    sensitivity: "restricted",
  },
  {
    id: "sb-a17-traction-dashboard",
    title: "Traction dashboard export (sample)",
    producedBy:
      "Wired the product analytics export so activation and week-4 retention stopped being screenshots.",
    analysisArea: "business_performance_kpis",
    criterion: null,
    evidenceCategory: "traction",
    stageCoverage: ["customers"],
    issuedAt: "2024-09-19",
    expiresAt: "2025-09-19",
    transitions: SUPERSEDED,
    state: "archived",
    dataRoomFolder: "5. Market & Traction",
    dataRoomDocument: "Traction Dashboard",
    contentType: "application/pdf",
    sizeBytes: 995_328,
    sensitivity: "private",
  },
];

const S3_ARTEFACTS: readonly SprocketbayArtefact[] = [
  {
    id: "sb-a18-privacy-policy",
    title: "Privacy policy & APP compliance statement (sample)",
    producedBy:
      "Published a privacy policy mapped to the Australian Privacy Principles once the first enterprise buyer sent a security questionnaire.",
    analysisArea: "governance_risk_compliance",
    criterion: "documents",
    evidenceCategory: "compliance",
    stageCoverage: ["compliance"],
    issuedAt: "2024-11-05",
    expiresAt: "2026-11-05",
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "7. IP & Compliance",
    dataRoomDocument: "Privacy Policy",
    contentType: "application/pdf",
    sizeBytes: 268_390,
    sensitivity: "public",
  },
  {
    id: "sb-a19-ip-assignment",
    title: "IP assignment deeds — contractors (sample)",
    producedBy:
      "Chased down assignment deeds from every contractor who had touched the codebase, including two who had already rolled off.",
    analysisArea: "governance_risk_compliance",
    criterion: "documents",
    evidenceCategory: "ip",
    stageCoverage: ["ip"],
    issuedAt: "2024-12-12",
    expiresAt: null,
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "7. IP & Compliance",
    dataRoomDocument: "IP Assignment Deeds (Contractors)",
    contentType: "application/pdf",
    sizeBytes: 3_412_889,
    sensitivity: "restricted",
  },
  {
    id: "sb-a20-litigation-register",
    title: "Litigation & disputes register — nil return (sample)",
    producedBy:
      "Opened a disputes register and recorded a nil return, so 'none' became a dated statement instead of an absence.",
    analysisArea: "governance_risk_compliance",
    criterion: "documents",
    evidenceCategory: "compliance",
    stageCoverage: ["risk"],
    issuedAt: "2025-01-16",
    expiresAt: "2026-01-16",
    transitions: SUPERSEDED,
    state: "archived",
    dataRoomFolder: "8. Contracts & Agreements",
    dataRoomDocument: "Litigation & Disputes Register",
    contentType: "application/pdf",
    sizeBytes: 58_112,
    sensitivity: "private",
  },
  {
    id: "sb-a21-security-audit",
    title: "Security audit / penetration test report (sample)",
    producedBy:
      "Commissioned an external penetration test and fixed the two high findings before publishing the report to the data room.",
    analysisArea: "technology_architecture",
    criterion: "code_git",
    evidenceCategory: "security",
    stageCoverage: ["risk", "product"],
    issuedAt: "2025-02-11",
    expiresAt: "2026-02-11",
    transitions: SUPERSEDED,
    state: "archived",
    dataRoomFolder: "4. Product & Technology",
    dataRoomDocument: "Security Audit / Pen Test Report",
    contentType: "application/pdf",
    sizeBytes: 4_120_576,
    sensitivity: "restricted",
  },
  {
    id: "sb-a22-org-chart",
    title: "Organisational chart — 19 people (sample)",
    producedBy:
      "Drew the org chart honestly, including the three roles that were one person wearing two hats.",
    analysisArea: "hr_organisation",
    criterion: "team_structure",
    evidenceCategory: "people",
    stageCoverage: ["people"],
    issuedAt: "2025-03-04",
    expiresAt: "2026-03-04",
    transitions: SUPERSEDED,
    state: "archived",
    dataRoomFolder: "6. Team & Advisors",
    dataRoomDocument: "Organisational Chart",
    contentType: "application/pdf",
    sizeBytes: 214_016,
    sensitivity: "private",
  },
  {
    id: "sb-a23-key-customer-contracts",
    title: "Key customer contracts — top 3 by ACV (sample)",
    producedBy:
      "Uploaded the three largest customer agreements after redacting the counterparties' pricing schedules.",
    analysisArea: "revenue_model_sales",
    criterion: "revenue",
    evidenceCategory: "contract",
    stageCoverage: ["revenue", "customers"],
    issuedAt: "2025-03-27",
    expiresAt: null,
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "8. Contracts & Agreements",
    dataRoomDocument: "Key Customer Contracts (Top 3 by ACV)",
    contentType: "application/pdf",
    sizeBytes: 5_284_352,
    sensitivity: "highly_sensitive",
  },
];

const S4_ARTEFACTS: readonly SprocketbayArtefact[] = [
  {
    id: "sb-a24-audited-financials",
    title: "Audited financial statements — FY24 (sample)",
    producedBy:
      "Engaged an external assurance firm for the first full-scope audit; the FY24 opinion is what moved the ladder to attested.",
    analysisArea: "financial_health",
    criterion: null,
    evidenceCategory: "financial",
    stageCoverage: ["finance_baseline", "revenue"],
    issuedAt: "2025-09-30",
    expiresAt: "2026-09-30",
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "3. Financial Projections",
    dataRoomDocument: "Audited Financial Statements (3 years)",
    contentType: "application/pdf",
    sizeBytes: 6_291_456,
    sensitivity: "restricted",
  },
  {
    id: "sb-a25-secondary-register",
    title: "Secondary transactions register (sample)",
    producedBy:
      "Ran an employee-liquidity secondary — no primary capital raised — and recorded every transfer against the share register.",
    analysisArea: "founder_leadership",
    criterion: "founder_profile",
    evidenceCategory: "governance",
    stageCoverage: ["ownership"],
    issuedAt: "2025-10-21",
    expiresAt: null,
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "2. Cap Table & Equity",
    dataRoomDocument: "Secondary Transactions Register",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 92_160,
    sensitivity: "highly_sensitive",
  },
  {
    id: "sb-a26-modern-slavery",
    title: "Modern slavery statement (sample)",
    producedBy:
      "Wrote a supply-chain statement covering the cloud and contractor spend, because procurement reviewers started asking for one.",
    analysisArea: "governance_risk_compliance",
    criterion: "documents",
    evidenceCategory: "esg",
    stageCoverage: ["sustainability"],
    issuedAt: "2025-11-18",
    expiresAt: "2026-11-18",
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "12. AU Compliance",
    dataRoomDocument: "Modern Slavery Act Statement",
    contentType: "application/pdf",
    sizeBytes: 402_432,
    sensitivity: "public",
  },
  {
    id: "sb-a27-cohort-analysis",
    title: "Cohort revenue analysis — 24 months (sample)",
    producedBy:
      "Built the retained-revenue cohort view that turned two years of usage logs into a defensible expansion curve.",
    analysisArea: "business_performance_kpis",
    criterion: null,
    evidenceCategory: "traction",
    stageCoverage: ["customers", "data_moat"],
    issuedAt: "2025-12-15",
    expiresAt: "2026-12-15",
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "3. Financial Projections",
    dataRoomDocument: "Cohort Revenue Analysis",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 1_048_576,
    sensitivity: "restricted",
  },
  {
    id: "sb-a28-dependency-inventory",
    title: "Third-party dependency inventory (sample)",
    producedBy:
      "Generated an SBOM and licence inventory so the data moat claim could be separated from the open-source it sits on.",
    analysisArea: "technology_architecture",
    criterion: "code_git",
    evidenceCategory: "security",
    stageCoverage: ["data_moat", "risk"],
    issuedAt: "2026-01-27",
    expiresAt: "2027-01-27",
    transitions: AUTO_VERIFIED,
    state: "verified",
    dataRoomFolder: "4. Product & Technology",
    dataRoomDocument: "Third-Party Dependency Inventory",
    contentType: "application/json",
    sizeBytes: 786_432,
    sensitivity: "private",
  },
];

const S5_ARTEFACTS: readonly SprocketbayArtefact[] = [
  {
    id: "sb-a29-board-minutes",
    title: "Board minutes — rolling 12 months (sample)",
    producedBy:
      "Started circulating minutes within five business days of each meeting, which is the habit listing-grade reporting actually depends on.",
    analysisArea: "governance_risk_compliance",
    criterion: "documents",
    evidenceCategory: "governance",
    stageCoverage: ["governance"],
    issuedAt: "2026-03-11",
    expiresAt: "2027-03-11",
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "1. Corporate & Legal",
    dataRoomDocument: "Board Minutes (Last 12 months)",
    contentType: "application/pdf",
    sizeBytes: 2_621_440,
    sensitivity: "restricted",
  },
  {
    id: "sb-a30-management-accounts",
    title: "Monthly management accounts — last 12 months (sample)",
    producedBy:
      "Closed the books monthly on a fixed calendar and published the pack, instead of rebuilding numbers for each request.",
    analysisArea: "financial_health",
    criterion: null,
    evidenceCategory: "financial",
    stageCoverage: ["finance_baseline", "revenue"],
    issuedAt: "2026-04-14",
    expiresAt: "2027-04-14",
    transitions: HUMAN_VERIFIED,
    state: "verified",
    dataRoomFolder: "3. Financial Projections",
    dataRoomDocument: "Monthly Management Accounts (Last 12 months)",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 3_145_728,
    sensitivity: "restricted",
  },
  {
    id: "sb-a31-hiring-plan",
    title: "Hiring plan — next 12 months (sample)",
    producedBy:
      "Mapped the next 12 months of hiring against the two functions that were already the constraint, not the ones that felt exciting.",
    analysisArea: "team_culture",
    criterion: "team",
    evidenceCategory: "people",
    stageCoverage: ["people"],
    issuedAt: "2026-05-06",
    expiresAt: "2027-05-06",
    transitions: AUTO_VERIFIED,
    state: "verified",
    dataRoomFolder: "6. Team & Advisors",
    dataRoomDocument: "Hiring Plan (12 months)",
    contentType: "application/pdf",
    sizeBytes: 176_128,
    sensitivity: "private",
  },
  {
    id: "sb-a32-uptime-sla",
    title: "Uptime / SLA history — 12 months (sample)",
    producedBy:
      "Published a year of uptime against the contractual SLA, including the one month it was missed and what changed after.",
    analysisArea: "operations_process",
    criterion: null,
    evidenceCategory: "product",
    stageCoverage: ["product"],
    issuedAt: "2026-06-02",
    expiresAt: "2027-06-02",
    transitions: AUTO_VERIFIED,
    state: "verified",
    dataRoomFolder: "4. Product & Technology",
    dataRoomDocument: "Uptime / SLA History (12 months)",
    contentType: "application/pdf",
    sizeBytes: 524_288,
    sensitivity: "public",
  },
  {
    id: "sb-a33-press-coverage",
    title: "Press & media coverage pack (sample)",
    producedBy:
      "Collected the coverage that actually drove signups and dropped the rest, so the brand claim is evidenced rather than asserted.",
    analysisArea: "marketing_brand",
    criterion: null,
    evidenceCategory: "other",
    stageCoverage: [],
    issuedAt: "2026-06-24",
    expiresAt: null,
    transitions: AUTO_VERIFIED,
    state: "verified",
    dataRoomFolder: "10. References & Due Diligence",
    dataRoomDocument: "Press & Media Coverage",
    contentType: "application/pdf",
    sizeBytes: 8_388_608,
    sensitivity: "public",
  },
  {
    id: "sb-a34-continuous-monitoring",
    title: "Continuous-monitoring connector consent (sample)",
    producedBy:
      "Started the L5 step: authorising BlockID to re-check the registry, the accounting ledger and the audit opinion on a schedule. Sitting with a reviewer as at the walkthrough date.",
    analysisArea: "governance_risk_compliance",
    criterion: "documents",
    evidenceCategory: "compliance",
    stageCoverage: ["compliance"],
    issuedAt: "2026-07-14",
    expiresAt: "2027-07-14",
    transitions: IN_HUMAN_REVIEW,
    state: "validation_required",
    dataRoomFolder: "10. References & Due Diligence",
    dataRoomDocument: "Due Diligence Checklist (Auto-generated)",
    contentType: "application/pdf",
    sizeBytes: 131_072,
    sensitivity: "private",
  },
];

// ─── Criterion answers, per stage (cumulative) ──────────────────────
//
// The per-stage `score` values are the fixture's only free parameters that
// matter to the headline number. They were chosen so that:
//   * each stage's weighted composite clears that stage's `exitTrustScore`
//     (S0 20 → S1 40 → S2 60 → S3 65 → S4 75), and
//   * the S5 composite lands on exactly 81.30, which is what
//     `deriveTrustScore()` returns for the `capability_scores` migration
//     0299 already stored — see SPROCKETBAY_RECONCILIATION §1, and
//   * S5 falls short of S5's own 85 exit bar, because the company is still
//     in S5. That is the point of the last panel, not an oversight.

const S0_ANSWERS: readonly SprocketbayCriterionAnswer[] = [
  answer("idea", 62, 1, 1,
    "Release engineering teams lose a day a week reconciling deploy state across three tools. We collapse that into one timeline. Validated in 14 discovery calls; 9 of 14 described the same manual reconciliation ritual unprompted."),
  answer("market", 45, 1, 1,
    "AU/NZ platform-engineering tooling, expanding into the broader English-speaking mid-market. Sized bottom-up from team counts rather than top-down from an analyst TAM figure; the top-down number is not defensible yet."),
  answer("founder_profile", 70, 2, 1,
    "Two founders, eleven years combined in platform and release engineering at mid-market SaaS. No prior exit. Domain fit is the strength; commercial experience is the acknowledged gap."),
  answer("website", 40, 0, 1,
    "Single landing page with a waitlist form. No product, no docs, no pricing yet — deliberately, because there is nothing to sell."),
  answer("roadmap", 20, 0, 0,
    "Six-week plan to a clickable prototype. Nothing beyond that is written down yet."),
];

const S1_ANSWERS: readonly SprocketbayCriterionAnswer[] = [
  answer("idea", 70, 1, 1,
    "Wedge narrowed from 'deploy visibility' to 'deploy state reconciliation' after the prototype showed people only cared about the diff. Same 14 interviews, sharper claim."),
  answer("market", 58, 2, 1,
    "Bottom-up sizing now has a named segment and an estimated seat count per team. Competitive set documented: two incumbents priced for enterprise, one open-source project with no support model."),
  answer("founder_profile", 74, 2, 2,
    "Founder profiles published, roles split cleanly between product and platform. Vesting and IP assignment executed before the first line of production code."),
  answer("code_git", 62, 1, 1,
    "Private monorepo, TypeScript, 41% line coverage, CI on every push. Architecture note records the two decisions that would be expensive to reverse."),
  answer("website", 55, 0, 2,
    "Marketing site plus a docs subdomain. Domain control verified by DNS record, which is what actually moved the verification ladder."),
  answer("team", 45, 0, 1,
    "Two founders and one part-time contractor. No hires yet; the hiring plan is a paragraph, not a document."),
  answer("gtm_strategy", 30, 0, 1,
    "Intent is docs-led self-serve with no outbound. Untested — there is no traffic to draw a conclusion from."),
  answer("documents", 55, 3, 0,
    "Constitution adopted, directors register current, first pitch deck assembled. Financial model exists but is a single scenario."),
  answer("team_structure", 35, 0, 0,
    "Two directors, one company secretary, consents to act on file. No advisory board."),
  answer("roadmap", 45, 1, 1,
    "Twelve-week MVP plan with named milestones. Beyond the MVP the roadmap is themes rather than dates, which is stated explicitly."),
];

const S2_ANSWERS: readonly SprocketbayCriterionAnswer[] = [
  answer("idea", 78, 2, 2,
    "The wedge now has paying evidence: teams adopt for reconciliation and stay for the audit trail. That second-order use was not in the original thesis."),
  answer("market", 70, 2, 2,
    "Segment sizing reconciled against actual signup firmographics for the first time; the earlier estimate was 20% optimistic and has been corrected downward."),
  answer("founder_profile", 76, 2, 2,
    "Unchanged team, now with two years of operating history behind the same claim."),
  answer("code_git", 76, 2, 2,
    "68% coverage, external contributors onboarded through the same review path as staff, incident runbooks in the repo rather than in someone's head."),
  answer("website", 68, 1, 2,
    "Docs became the primary acquisition surface. Self-serve signup and pricing published; conversion measured rather than assumed."),
  answer("team", 60, 1, 2,
    "Nine people. Support and engineering are staffed; there is no dedicated finance or people function, which is recorded as a gap not a plan."),
  answer("customer_size", 58, 2, 1,
    "Paying teams in the low hundreds with month-on-month growth in the low teens. Retention measured at week four; the twelve-month number does not exist yet."),
  answer("gtm_strategy", 55, 1, 1,
    "Docs-led motion validated: the two funded channels both pay back inside a quarter, and everything else was stopped."),
  answer("documents", 66, 5, 0,
    "Shareholders agreement, ESOP rules, unit economics and revenue proof all on file and current. Deck is now backed by exports rather than estimates."),
  answer("dataroom", 50, 4, 1,
    "Data room opened with the corporate, cap-table and financial sections populated. Product and compliance sections are still stubs."),
  answer("team_structure", 52, 1, 1,
    "Option plan adopted before the fifth hire. Still no advisory board and no board committees."),
  answer("roadmap", 62, 1, 2,
    "Rolling quarterly roadmap with explicit dependencies. Prioritisation rule written down: reconciliation correctness beats surface area."),
  answer("revenue", 55, 2, 1,
    "Self-serve subscription, annual and monthly. Gross margin measured from actual infrastructure cost per account rather than an assumed percentage."),
];

const S3_ANSWERS: readonly SprocketbayCriterionAnswer[] = [
  answer("idea", 82, 2, 2,
    "Defensibility argument now rests on the reconciliation history a team accumulates, which is the thing a competitor cannot backfill."),
  answer("market", 75, 3, 2,
    "Third-party market data added alongside the bottom-up model; the two agree within a band that is stated rather than hidden."),
  answer("founder_profile", 78, 2, 2,
    "Both founders still operating. Succession risk is documented in the risk register rather than left implicit."),
  answer("code_git", 82, 3, 2,
    "External penetration test passed after two high findings were remediated. Dependency and licence inventory generated from the build."),
  answer("website", 74, 1, 2,
    "Trust surface added: status page, security page, published SLA. These are what enterprise buyers check before they talk to anyone."),
  answer("team", 68, 2, 2,
    "Nineteen people. Org chart records the three roles that are one person wearing two hats, which is the honest version."),
  answer("customer_size", 68, 3, 2,
    "Concentration check run deliberately: no single account above 6% of revenue, which is the number that would have killed the self-serve story."),
  answer("gtm_strategy", 62, 2, 2,
    "Motion unchanged and now instrumented end to end. Enterprise inbound is answered but not pursued — a stated choice, not a capability gap."),
  answer("documents", 72, 8, 1,
    "Privacy policy, IP assignment deeds, disputes register and top-3 customer contracts added. Compliance section stopped being a stub."),
  answer("dataroom", 66, 8, 1,
    "Eight of ten sections populated. Tax and AU-compliance sections outstanding and flagged as such to anyone with a share link."),
  answer("team_structure", 62, 2, 1,
    "Two independent advisors appointed. Board meets quarterly; no committees yet."),
  answer("roadmap", 70, 2, 2,
    "Twelve-month roadmap with a named owner per theme and a written definition of what would cause a theme to be dropped."),
  answer("revenue", 64, 3, 2,
    "Two years of settled revenue. Expansion revenue separated from new revenue for the first time, which changed how growth reads."),
];

const S4_ANSWERS: readonly SprocketbayCriterionAnswer[] = [
  answer("idea", 85, 3, 2,
    "Thesis has survived two years of contact with customers without being re-pitched. The reconciliation-history moat is now measurable."),
  answer("market", 80, 3, 3,
    "Sizing refreshed annually against real firmographics. The band is narrower and the method is documented well enough for someone else to reproduce."),
  answer("founder_profile", 79, 2, 2,
    "Unchanged. The score stops climbing here because founder track record is a fact about the past, and nothing new happened to it."),
  answer("code_git", 87, 4, 3,
    "SBOM published, licence inventory clean, coverage 79%. Release process is documented well enough that the founders are not the release path."),
  answer("website", 80, 2, 3,
    "Docs, status, security, pricing and a published SLA. Procurement reviewers can answer most of their questionnaire without sending it."),
  answer("team", 74, 3, 3,
    "Thirty-one people. Finance and people functions now staffed rather than borrowed, which was the gap flagged two stages earlier."),
  answer("customer_size", 75, 4, 3,
    "Cohort view over 24 months shows net expansion above 100%. That is the number that made the audited accounts worth commissioning."),
  answer("gtm_strategy", 70, 3, 3,
    "Still low-touch, still no outbound team. Channel economics reviewed quarterly against payback rather than volume."),
  answer("documents", 78, 12, 2,
    "Audited FY24 statements, secondary transactions register and a modern slavery statement added. Procurement export now assembles without manual work."),
  answer("dataroom", 78, 14, 2,
    "All ten core sections populated; the AU tax and compliance sections filled during audit preparation."),
  answer("team_structure", 70, 3, 2,
    "Audit and remuneration responsibilities assigned at board level. Charters drafted, not yet adopted — recorded as outstanding."),
  answer("roadmap", 76, 3, 3,
    "Roadmap reconciled against the cohort data, so themes are justified by retained revenue rather than by enthusiasm."),
  answer("revenue", 72, 4, 3,
    "First externally audited revenue figure. The employee-liquidity secondary raised no primary capital and is disclosed as such."),
];

const S5_ANSWERS: readonly SprocketbayCriterionAnswer[] = [
  answer("idea", 88, 3, 3,
    "Category position is now something customers describe back unprompted, which is the only version of positioning that counts."),
  answer("market", 83, 4, 3,
    "Sizing, competitive set and the reasons the estimate could be wrong are all published in the same document."),
  answer("founder_profile", 79, 2, 2,
    "Unchanged from S4 by design — see above. A fixture that quietly inflated this to keep the line rising would be the dishonest option."),
  answer("code_git", 90, 4, 3,
    "Coverage 83%, SBOM regenerated per release, security review cadence contractual rather than ad hoc."),
  answer("website", 85, 2, 3,
    "Trust surface is complete enough that the public BlockID profile is linked from the footer rather than buried."),
  answer("team", 78, 3, 3,
    "Forty-four people. The constraint is now hiring speed in two functions, which the hiring plan names explicitly."),
  answer("customer_size", 80, 5, 3,
    "Retention, expansion and concentration are all published from the same source of truth the board pack uses."),
  answer("gtm_strategy", 74, 3, 3,
    "Lowest score on the board, and correctly so: the motion works but has never been tested outside its original segment."),
  answer("documents", 83, 15, 2,
    "Board minutes on a five-day cycle and monthly management accounts on a fixed calendar. Listing-grade reporting is a habit, not a project."),
  answer("dataroom", 86, 18, 3,
    "Every section current, with an owner and a review date per section rather than a single 'last updated' stamp."),
  answer("team_structure", 76, 3, 2,
    "Committee charters adopted. Independent chair still not appointed — the single biggest governance gap and it is on the register."),
  answer("roadmap", 80, 3, 3,
    "Roadmap, cohort data and the financial model are reconciled to each other; a change in one now forces a change in the others."),
  answer("revenue", 77, 5, 3,
    "Two consecutive audited years. Unit economics stable across cohorts, which is what makes the projection worth reading."),
];

// ─── Verification signals per stage ─────────────────────────────────
//
// Monotonic by construction: each stage's signals are the previous
// stage's plus whatever the founder completed. See
// SPROCKETBAY_RECONCILIATION §3 for the ABR/ABN tension.

const V_S0: VerificationInputs = {
  hasBusinessId: true,
  abrConfirmed: false,
  abrStatus: null,
  domainVerified: false,
  emailVerified: true,
  financialsAttested: false,
  independentlyAudited: false,
  continuouslyMonitored: false,
};
const V_S1: VerificationInputs = {
  ...V_S0,
  abrConfirmed: true,
  abrStatus: "Active",
  domainVerified: true,
};
const V_S2: VerificationInputs = { ...V_S1, financialsAttested: true };
const V_S3: VerificationInputs = { ...V_S2 };
const V_S4: VerificationInputs = { ...V_S3, independentlyAudited: true };
const V_S5: VerificationInputs = { ...V_S4 };

// ─── Stages ─────────────────────────────────────────────────────────

export const SPROCKETBAY_STAGES: readonly SprocketbayStage[] = [
  {
    stage: "S0",
    phases: ["vision", "customer_dev"],
    enteredOn: "2024-02-05",
    exitedOn: "2024-02-18",
    daysInStage: 13,
    narrative:
      "Two weeks. The founders verified who they were, registered the company, signed vesting before writing code, and ran 14 discovery calls. Nothing was built. The output is a Genesis Certificate that says an identified person owns an identified entity — which is the only claim anyone can make on day three.",
    artefacts: S0_ARTEFACTS,
    answers: S0_ANSWERS,
    verification: V_S0,
    openCriticalFindings: 0,
  },
  {
    stage: "S1",
    phases: ["revenue_model", "pitch"],
    enteredOn: "2024-02-19",
    exitedOn: "2024-04-14",
    daysInStage: 55,
    narrative:
      "Eight weeks turning an idea into a company that can be checked. Constitution adopted, directors registered, domain control proved by DNS record, first financial model built bottom-up, MVP architecture written down. The domain proof is what actually moved the ladder — self-declaration alone does not.",
    artefacts: S1_ARTEFACTS,
    answers: S1_ANSWERS,
    verification: V_S1,
    openCriticalFindings: 0,
  },
  {
    stage: "S2",
    phases: ["mentor_review", "legal_equity", "go_to_market"],
    enteredOn: "2024-04-15",
    exitedOn: "2024-10-11",
    daysInStage: 179,
    narrative:
      "Six months where the numbers stopped being estimates. Payment-processor exports replaced typed-in MRR, a cohort-derived CAC replaced a blended guess, and the shareholders agreement and option plan were executed before the fifth hire rather than after the first dispute. Financials attested — the ladder reaches trust tier.",
    artefacts: S2_ARTEFACTS,
    answers: S2_ANSWERS,
    verification: V_S2,
    openCriticalFindings: 0,
  },
  {
    stage: "S3",
    phases: ["product_dev", "investor_review"],
    enteredOn: "2024-10-12",
    exitedOn: "2025-04-10",
    daysInStage: 180,
    narrative:
      "The stage where an enterprise security questionnaire arrives and the answer has to already exist. Privacy policy mapped to the APPs, contractor IP assignments chased down, external penetration test passed, disputes register opened with a dated nil return. Absence of a problem became a statement rather than a silence.",
    artefacts: S3_ARTEFACTS,
    answers: S3_ANSWERS,
    verification: V_S3,
    openCriticalFindings: 0,
  },
  {
    stage: "S4",
    phases: ["team", "growth"],
    enteredOn: "2025-04-11",
    exitedOn: "2026-02-25",
    daysInStage: 320,
    narrative:
      "Ten months to attested. The first full-scope external audit, an employee-liquidity secondary that raised no primary capital, a modern slavery statement because procurement started asking, and a 24-month cohort view that made the audit worth commissioning. Level 4 — the rung the public profile currently shows.",
    artefacts: S4_ARTEFACTS,
    answers: S4_ANSWERS,
    verification: V_S4,
    openCriticalFindings: 0,
  },
  {
    stage: "S5",
    phases: ["funding"],
    enteredOn: "2026-02-26",
    exitedOn: null,
    daysInStage: 144,
    narrative:
      "Where Sprocketbay actually is. Board minutes on a five-day cycle, monthly management accounts on a fixed calendar, a complete data room with an owner per section. Two things are still open: the composite sits at 81.3 against an 85 bar, and the continuous-monitoring consent that unlocks Level 5 is with a reviewer. The walkthrough ends here on purpose — a demo that showed every gate closed would be teaching the wrong thing.",
    artefacts: S5_ARTEFACTS,
    answers: S5_ANSWERS,
    verification: V_S5,
    openCriticalFindings: 0,
  },
];

// ─── Stored-profile mirror (migration 0299) ─────────────────────────

/**
 * The 12 capability scores migration 0299 wrote onto the profile row.
 * Mirrored so `journey.test.ts` can prove the walkthrough's computed
 * composite matches what `/id/sprocketbay-demo` publishes. The migration
 * is the source of truth; if it changes, the test fails here first.
 */
export const SPROCKETBAY_STORED_CAPABILITY_SCORES: Readonly<
  Record<string, number>
> = {
  leadership: 84,
  people: 79,
  culture: 86,
  strategy: 88,
  commercial: 76,
  brand: 72,
  ops: 83,
  performance: 80,
  risk: 78,
  tech: 91,
  digital: 85,
  data: 74,
};

/** `projects.verification_level` as stored by migration 0299. */
export const SPROCKETBAY_STORED_VERIFICATION_LEVEL = 4;

// ─── Engines ────────────────────────────────────────────────────────

const WEIGHT_BY_CRITERION: Readonly<Record<CriterionKey, number>> =
  CRITERIA.reduce(
    (acc, c) => {
      acc[c.key] = c.weight;
      return acc;
    },
    {} as Record<CriterionKey, number>,
  );

/**
 * The 13-criteria weighted composite, 0..100.
 *
 * `CRITERIA[].weight` sums to 100 (pinned by `evaluation-criteria.test.ts`),
 * so this is a plain weighted mean over the full criterion set with
 * unanswered criteria counting as zero — an unanswered criterion is a real
 * gap, not a criterion to be excluded from the denominator.
 *
 * Returned to two decimal places, which is the natural precision when
 * integer scores meet integer weights over a 100-point denominator, and
 * matches `deriveTrustScore()`'s one-decimal rounding at the comparison
 * point.
 */
export function computeCriteriaComposite(
  answers: readonly SprocketbayCriterionAnswer[],
): number {
  let total = 0;
  for (const a of answers) {
    total += a.score * WEIGHT_BY_CRITERION[a.criterion];
  }
  return Math.round(total) / 100;
}

/**
 * Quality ladder for one answer, straight out of `computeQuality()`.
 * File and link *counts* are expanded into placeholder arrays because
 * that engine measures length, not content.
 */
export function qualityFor(a: SprocketbayCriterionAnswer): QualityLevel {
  return computeQuality({
    text_input: a.answer,
    files: new Array<null>(a.fileCount).fill(null),
    links: new Array<null>(a.linkCount).fill(null),
    ai_score: a.score,
  });
}

/** Replay an artefact's transition path and return where it lands. */
export function replayArtefactState(
  a: SprocketbayArtefact,
): EvidenceState | null {
  let state: EvidenceState = "uploaded";
  for (const transition of a.transitions) {
    const next = nextEvidenceState(state, transition);
    if (next === null) return null;
    state = next;
  }
  return state;
}

/**
 * Coverage areas evidenced by the end of `stageId` — cumulative across
 * every prior stage, and counting only artefacts that are still live.
 * Archived and expired evidence stops counting, which is exactly how the
 * real coverage check behaves.
 */
export function coveredAreasThrough(stageId: UnicornStageId): string[] {
  const cutoff = UNICORN_STAGE_IDS.indexOf(stageId);
  const covered = new Set<string>();
  for (let i = 0; i <= cutoff; i++) {
    const stage = SPROCKETBAY_STAGES[i];
    for (const artefact of stage.artefacts) {
      // Evidence archived or expired later in the arc still counted at the
      // time its stage was assessed — the arc is read forward, not from
      // today. `stageCoverage` therefore accrues on upload, and the
      // "still live today" view is a separate concern surfaced by
      // `liveArtefacts()`.
      for (const area of artefact.stageCoverage) covered.add(area);
    }
  }
  return Array.from(covered).sort();
}

/** Artefacts whose evidence row is still live as at `SPROCKETBAY_AS_AT`. */
export function liveArtefacts(): SprocketbayArtefact[] {
  return SPROCKETBAY_STAGES.flatMap((s) => s.artefacts).filter(
    (a) => a.state !== "archived" && a.state !== "rejected" && a.state !== "expired",
  );
}

/** Every artefact in the arc, in chronological (stage) order. */
export function allArtefacts(): SprocketbayArtefact[] {
  return SPROCKETBAY_STAGES.flatMap((s) => s.artefacts);
}

/**
 * The fully-computed view of one stage. Nothing on this shape is authored
 * — every field is the output of an engine given the fixture's inputs.
 */
export interface SprocketbayStageComputed {
  stage: SprocketbayStage;
  catalogue: UnicornStage;
  /** Canonical 8-stage buckets the growth phases in this stage map to. */
  canonicalStageLabels: readonly string[];
  /** 13-criteria weighted composite, 0..100. */
  trustScore: number;
  /** Ladder rung from `computeVerificationLevel()`. */
  verificationLevel: VerificationLevel;
  /** Quality ladder per answered criterion. */
  qualities: readonly { criterion: CriterionKey; quality: QualityLevel }[];
  /** Criteria with no answer at all by the end of this stage. */
  unansweredCriteria: readonly CriterionKey[];
  /** Coverage areas evidenced, cumulative. */
  coveredAreas: readonly string[];
  /** Mandatory coverage areas still missing at this stage. */
  missingAreas: readonly string[];
  progress: ComputeResult;
  /** The stage's exit output, unlocked only when `progress.canAdvance`. */
  unlocks: string;
}

/** Compute everything the walkthrough renders for one stage. */
export function computeStage(
  stage: SprocketbayStage,
): SprocketbayStageComputed {
  const catalogue = getStage(stage.stage);
  const trustScore = computeCriteriaComposite(stage.answers);
  const verificationLevel = computeVerificationLevel(stage.verification);
  const coveredAreas = coveredAreasThrough(stage.stage);
  const answered = new Set(stage.answers.map((a) => a.criterion));

  const progress = computeStageProgress({
    currentStageId: stage.stage,
    verificationLevel,
    trustScore,
    coveredAreas,
    blockerCount: stage.openCriticalFindings,
    daysInStage: stage.daysInStage,
  });

  return {
    stage,
    catalogue,
    canonicalStageLabels: stage.phases.map(
      (p) => growthPhaseToStageLabel(p)?.label_en ?? p,
    ),
    trustScore,
    verificationLevel,
    qualities: stage.answers.map((a) => ({
      criterion: a.criterion,
      quality: qualityFor(a),
    })),
    unansweredCriteria: CRITERION_KEYS.filter((k) => !answered.has(k)),
    coveredAreas,
    missingAreas: catalogue.mandatoryAreas.filter(
      (a) => !coveredAreas.includes(a),
    ),
    progress,
    unlocks: catalogue.exitOutput,
  };
}

/** The whole walkthrough, computed. */
export function computeWalkthrough(): SprocketbayStageComputed[] {
  return SPROCKETBAY_STAGES.map(computeStage);
}

// ─── Display helpers ────────────────────────────────────────────────

/** English label for a growth phase, from the canonical taxonomy. */
export function phaseLabel(id: GrowthPhaseId): string {
  return GROWTH_PHASE_LABELS[id].en;
}

/** Label for an analysis area, from the §6 catalogue. */
export function analysisAreaLabel(id: AnalysisAreaId): string {
  const area = ANALYSIS_AREAS.find((a) => a.id === id);
  if (!area) throw new Error(`Unknown analysis area: ${id}`);
  return area.label;
}

/** Human-readable title for a criterion, from the 13-criteria catalogue. */
export function criterionTitle(key: CriterionKey): string {
  const def = CRITERIA.find((c) => c.key === key);
  if (!def) throw new Error(`Unknown criterion: ${key}`);
  return def.title;
}

// ─── Reconciliation notes ───────────────────────────────────────────

export interface ReconciliationNote {
  id: string;
  heading: string;
  body: string;
  /** true when the fixture and the stored data agree exactly. */
  reconciled: boolean;
}

/**
 * The three places this fixture had to meet data that already existed.
 * Rendered on the walkthrough page — a reader who checks the arithmetic
 * should find the caveats before they find the discrepancy.
 */
export const SPROCKETBAY_RECONCILIATION: readonly ReconciliationNote[] = [
  {
    id: "trust-score",
    heading: "Composite score vs the published profile",
    body:
      "The public profile derives its score as the mean of the 12 capability scores migration 0299 stored: 81.3. The walkthrough derives its score independently, by running the 13 criterion answers through the CRITERIA weights. Those are two different routes to one number, so the per-criterion scores in the S5 panel were chosen to make them land on the same value — 81.30 — rather than letting the demo publish two different 'trust scores' for the same company. The test asserts equality; if either side moves, it fails.",
    reconciled: true,
  },
  {
    id: "verification-level",
    heading: "Ladder rung vs the published profile",
    body:
      "The profile stores Level 4 (attested). Feeding the S4/S5 verification signals through computeVerificationLevel() returns 4 as well, and the S5 signals deliberately stop short of continuouslyMonitored so Level 5 stays above the company rather than being handed to it. No adjustment was needed.",
    reconciled: true,
  },
  {
    id: "abr-vs-no-abn",
    heading: "The ABR check has no ABN behind it",
    body:
      "This is the one place the demo cannot be fully honest in both directions at once. Level 2 on the real ladder requires a confirmed, Active ABR registration — but migration 0299 deliberately records no ABN, because publishing a checksum-valid ABN for a fictional company risks colliding with a real entity on ABN Lookup. The fixture therefore sets abrConfirmed / abrStatus='Active' from S1 so the ladder rung matches the profile's stored Level 4, while no ABN string exists anywhere in the demo. Read the registry step as illustrated, not performed: for a real customer that rung is only reachable with a real, live ABR lookup.",
    reconciled: false,
  },
  {
    id: "attestation-dates",
    heading: "Attestation dates vs the audit that unlocked Level 4",
    body:
      "The profile's attestation list carries 2026 dates, but the audit that moved the ladder to Level 4 is dated September 2025 in this arc. Both are true of the same company: an attestation list shows the current standing attestation of each type, and audits renew annually. The FY24 opinion is the one that unlocked the rung; the 2026 entries are the renewals that keep it.",
    reconciled: true,
  },
];
