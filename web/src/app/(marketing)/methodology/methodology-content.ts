/**
 * /methodology content builder — G14-S36 (goal doc §3 D4, F-3 default: no
 * weights in public).
 *
 * Pure: every figure on the page is read from the module that the engine
 * itself runs on — DIMENSION_OWNERS (titles, owners, criteria),
 * EVIDENCE_CONFIDENCE (the ladder), confidence-cap (who may set which
 * level), VERIFICATION_LEVEL_LABELS + VERIFICATION_MULTIPLIER (L0–L5),
 * SVI_VERSION / REPORT_V2_SCHEMA_VERSION / PIPELINE_VERSION and the
 * DATA_PRINCIPLE_SENTENCE constant (rendered verbatim). The page cannot
 * say something the code does not do.
 */

import { CRITERIA } from "@/lib/evaluation-criteria";
import { CAP_RULES_PLAIN, CONFIDENCE_LEVELS, type ConfidenceLevel, type EvidenceOrigin } from "@/lib/evidence/confidence-cap";
import { t, type Messages } from "@/lib/i18n/t";
import { DIMENSION_OWNERS, DIM_LEGACY_ORDER, criteriaForDimension, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { PIPELINE_VERSION } from "@/lib/report-pipeline/version";
import { REPORT_V2_SCHEMA_VERSION } from "@/lib/report-v2/schema";
import { EVIDENCE_CONFIDENCE, SVI_VERSION } from "@/lib/svi-analysis";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import {
  VERIFICATION_LEVEL_LABELS,
  VERIFICATION_MULTIPLIER,
  VERIFICATION_MULTIPLIER_MAX,
  VERIFICATION_MULTIPLIER_MIN,
} from "@/lib/verification/confidence-multiplier";
import type { VerificationLevel } from "@/lib/verification/level-engine";

export type MethodologyLocale = "en" | "vi";

export const METHODOLOGY_PATH = "/methodology";
export const CALIBRATION_PATH = "/methodology/calibration";

export interface MethodologyDimension {
  key: DimKey;
  code: string;
  title: string;
  shortLabel: string;
  owner: string;
  supporting: string[];
  criteria: string[];
}

export interface MethodologyLadderRow {
  level: ConfidenceLevel;
  confidencePct: number;
  meaning: string;
}

export interface MethodologyCapRow {
  origin: EvidenceOrigin;
  who: string;
  ceiling: ConfidenceLevel;
  rule: string;
}

export interface MethodologyVerificationRow {
  level: VerificationLevel;
  short: string;
  label: string;
  requires: string;
  multiplier: number;
}

export interface MethodologyProps {
  locale: MethodologyLocale;
  hero: { eyebrow: string; title: string; subtitle: string };
  dims: { kicker: string; title: string; intro: string; ownerLabel: string; criteriaLabel: string; weightsNote: string; items: MethodologyDimension[] };
  ladder: { kicker: string; title: string; intro: string; cols: { level: string; confidence: string; meaning: string }; rows: MethodologyLadderRow[] };
  caps: { title: string; intro: string; cols: { who: string; ceiling: string; rule: string }; rows: MethodologyCapRow[] };
  verification: {
    kicker: string;
    title: string;
    intro: string;
    cols: { level: string; label: string; requires: string; multiplier: string };
    rows: MethodologyVerificationRow[];
    multiplierNote: string;
  };
  audit: { kicker: string; title: string; paragraphs: string[]; statusHref: string };
  provenance: { kicker: string; title: string; paragraphs: string[] };
  versioning: { kicker: string; title: string; note: string; rows: Array<{ label: string; value: string }> };
  data: { kicker: string; title: string; sentence: string; translated: string | null };
  calibration: { kicker: string; title: string; body: string; link: string; href: string };
  cta: { title: string; primary: { href: string; label: string }; secondary: { href: string; label: string } };
}

const AGENT_LABEL: Record<string, string> = {
  ceo: "CEO", cto: "CTO", cfo: "CFO", cpo: "CPO", cmo: "CMO", cro: "CRO", clo: "CLO", chro: "CHRO", ciso: "CISO", cdo: "CDO", coo: "COO",
};

export function agentLabel(role: string): string {
  return AGENT_LABEL[role] ?? role.toUpperCase();
}

const CRITERION_TITLE = new Map(CRITERIA.map((c) => [c.key, c.title] as const));

/** The eight dimensions as the engine names them — no weights (F-3). */
export function methodologyDimensions(locale: MethodologyLocale = "en"): MethodologyDimension[] {
  return DIM_LEGACY_ORDER.map((key) => {
    const d = DIMENSION_OWNERS[key];
    return {
      key,
      code: key.toUpperCase(),
      title: locale === "vi" ? d.titleVi : d.title,
      shortLabel: d.shortLabel,
      owner: agentLabel(d.primary),
      supporting: d.supporting.map(agentLabel),
      // Primary criteria first; CGH and LCO reach their criteria through the
      // secondary lens only, so the union keeps every card non-empty.
      criteria: criteriaForDimension(key).map((c) => CRITERION_TITLE.get(c) ?? c),
    };
  });
}

function fill(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export function buildMethodologyProps(m: Messages, locale: MethodologyLocale = "en"): MethodologyProps {
  const T = (k: string) => t(m, k);
  const capByOrigin = new Map(CAP_RULES_PLAIN.map((r) => [r.origin, r] as const));
  const capOrigins: EvidenceOrigin[] = ["founder_text", "founder_upload", "connector", "reviewer"];

  return {
    locale,
    hero: { eyebrow: T("methodology.eyebrow"), title: T("methodology.title"), subtitle: T("methodology.subtitle") },
    dims: {
      kicker: T("methodology.dims.kicker"),
      title: T("methodology.dims.title"),
      intro: T("methodology.dims.intro"),
      ownerLabel: T("methodology.dims.owner"),
      criteriaLabel: T("methodology.dims.criteria"),
      weightsNote: T("methodology.dims.weightsNote"),
      items: methodologyDimensions(locale),
    },
    ladder: {
      kicker: T("methodology.ladder.kicker"),
      title: T("methodology.ladder.title"),
      intro: T("methodology.ladder.intro"),
      cols: { level: T("methodology.ladder.col.level"), confidence: T("methodology.ladder.col.confidence"), meaning: T("methodology.ladder.col.meaning") },
      rows: CONFIDENCE_LEVELS.map((level) => ({
        level,
        confidencePct: Math.round((EVIDENCE_CONFIDENCE[level] ?? 0) * 100),
        meaning: T(`methodology.ladder.level.${level}`),
      })),
    },
    caps: {
      title: T("methodology.caps.title"),
      intro: T("methodology.caps.intro"),
      cols: { who: T("methodology.caps.col.who"), ceiling: T("methodology.caps.col.ceiling"), rule: T("methodology.caps.col.rule") },
      rows: capOrigins.map((origin) => ({
        origin,
        who: T(`methodology.caps.${origin}.who`),
        ceiling: capByOrigin.get(origin)?.ceiling ?? "self_declared",
        rule: T(`methodology.caps.${origin}.rule`),
      })),
    },
    verification: {
      kicker: T("methodology.verification.kicker"),
      title: T("methodology.verification.title"),
      intro: T("methodology.verification.intro"),
      cols: {
        level: T("methodology.verification.col.level"),
        label: T("methodology.verification.col.label"),
        requires: T("methodology.verification.col.requires"),
        multiplier: T("methodology.verification.col.multiplier"),
      },
      rows: ([0, 1, 2, 3, 4, 5] as VerificationLevel[]).map((level) => ({
        level,
        short: VERIFICATION_LEVEL_LABELS[level].short,
        label: VERIFICATION_LEVEL_LABELS[level].label,
        requires: VERIFICATION_LEVEL_LABELS[level].requires,
        multiplier: VERIFICATION_MULTIPLIER[level],
      })),
      multiplierNote: fill(T("methodology.verification.multiplierNote"), {
        min: `×${VERIFICATION_MULTIPLIER_MIN.toFixed(2)}`,
        max: `×${VERIFICATION_MULTIPLIER_MAX.toFixed(2)}`,
      }),
    },
    audit: {
      kicker: T("methodology.audit.kicker"),
      title: T("methodology.audit.title"),
      paragraphs: [T("methodology.audit.p1"), T("methodology.audit.p2"), T("methodology.audit.p3")],
      statusHref: "/status",
    },
    provenance: {
      kicker: T("methodology.provenance.kicker"),
      title: T("methodology.provenance.title"),
      paragraphs: [T("methodology.provenance.p1"), T("methodology.provenance.p2")],
    },
    versioning: {
      kicker: T("methodology.versioning.kicker"),
      title: T("methodology.versioning.title"),
      note: T("methodology.versioning.note"),
      rows: [
        { label: T("methodology.versioning.svi"), value: `SVI ${SVI_VERSION}` },
        { label: T("methodology.versioning.schema"), value: `ReportV2 ${REPORT_V2_SCHEMA_VERSION}` },
        { label: T("methodology.versioning.pipeline"), value: PIPELINE_VERSION },
      ],
    },
    data: {
      kicker: T("methodology.data.kicker"),
      title: T("methodology.data.title"),
      sentence: DATA_PRINCIPLE_SENTENCE,
      translated: locale === "vi" && m["solutions.principle.data"] && m["solutions.principle.data"] !== DATA_PRINCIPLE_SENTENCE ? m["solutions.principle.data"] : null,
    },
    calibration: {
      kicker: T("methodology.calibration.kicker"),
      title: T("methodology.calibration.title"),
      body: T("methodology.calibration.body"),
      link: T("methodology.calibration.link"),
      href: CALIBRATION_PATH,
    },
    cta: {
      title: T("methodology.cta.title"),
      primary: { href: "/tbr/demo", label: T("methodology.cta.primary") },
      secondary: { href: locale === "vi" ? "/vi/how-it-works" : "/how-it-works", label: T("methodology.cta.secondary") },
    },
  };
}
