// Investor mandates — the PURE half: vocabulary, the 7-section Zod schemas
// and the row types (G13-W3-T2, BA spec §B.7). No server-only import, no
// DB — the client form (/workspace/investor/mandate/mandate-form.tsx), the
// API routes and the server lib (./mandates.ts, which re-exports all of
// this) share one definition of what a mandate is.
//
// Vocabulary = the startup taxonomy (D3): industries / business models /
// customer types / canonical stages / AU states + anz / apac / global /
// tags. `unclassified` is a startup state, never a mandate choice.

import { z } from "zod";
import {
  BUSINESS_MODELS,
  CANONICAL_STAGES,
  CUSTOMER_TYPES,
  HQ_STATES,
  INDUSTRIES,
  TAGS,
} from "@/lib/taxonomy/startup-taxonomy";
import { FIT_AXES_V2, validateWeights, type FitMandate, type LeadOrFollow } from "./fit-v2";

/** Mirrors lib/investor-portal.ts FIRM_MAX_LEN (kept here so the client bundle never imports server-only code). */
export const FIRM_NAME_MAX_LEN = 80;

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export const MANDATE_KINDS = ["vc", "angel", "family_office", "cvc", "accelerator", "government", "institutional"] as const;
export type MandateKind = (typeof MANDATE_KINDS)[number];

export const LEAD_OR_FOLLOW = ["lead", "follow", "both"] as const;
export const RISK_TOLERANCES = ["low", "medium", "high"] as const;
export type RiskTolerance = (typeof RISK_TOLERANCES)[number];

/** Existing `esg_constraints` column values (§B.7 section 6). */
export const ESG_CONSTRAINTS = ["no_gambling", "no_fossil", "no_weapons", "no_tobacco", "impact_only"] as const;
export type EsgConstraint = (typeof ESG_CONSTRAINTS)[number];

/** AU states + the wide scopes (§B.7 section 4). `national` = all of Australia. */
export const MANDATE_GEOGRAPHIES = [...HQ_STATES, "anz", "apac", "global"] as const;
export type MandateGeography = (typeof MANDATE_GEOGRAPHIES)[number];

/** Industries an investor can pick — `unclassified` is a startup state, not a mandate choice. */
export const MANDATE_INDUSTRIES = INDUSTRIES.filter((i) => i !== "unclassified");
export const MANDATE_BUSINESS_MODELS = BUSINESS_MODELS.filter((m) => m !== "unclassified");
export const MANDATE_CUSTOMER_TYPES = CUSTOMER_TYPES.filter((c) => c !== "unclassified");

export const MANDATE_SECTIONS = ["identity", "appetite", "stage_cheque", "geography", "floors", "tags_esg", "weights"] as const;
export type MandateSection = (typeof MANDATE_SECTIONS)[number];

export const MANDATE_LABEL_MAX_LEN = FIRM_NAME_MAX_LEN; // 80
export const MANDATE_THESIS_MAX_LEN = 280; // §B.7 section 1 (column CHECK)
export const CHEQUE_MAX_AUD = 1_000_000_000;

// ─── Zod (one schema per section, merged) ────────────────────────────────────

const trimmed = (max: number) => z.string().trim().max(max);
const enumList = <T extends readonly [string, ...string[]]>(values: T, max = 64) =>
  z.array(z.enum(values)).max(max).default([]).transform((arr) => Array.from(new Set(arr)));
const money = z.number().finite().min(0).max(CHEQUE_MAX_AUD).nullable().default(null);
const pct = z.number().finite().min(0).max(100).nullable().default(null);

function tuple<T extends readonly string[]>(values: T): [T[number], ...T[number][]] {
  return values as unknown as [T[number], ...T[number][]];
}

export const mandateIdentitySchema = z.object({
  label: trimmed(MANDATE_LABEL_MAX_LEN).min(1, "label required"),
  kind: z.enum(MANDATE_KINDS).default("angel"),
  thesis: trimmed(MANDATE_THESIS_MAX_LEN).nullable().default(null).transform((v) => (v ? v : null)),
  discoverable: z.boolean().default(false),
});

export const mandateAppetiteSchema = z.object({
  sectors_include: enumList(tuple(MANDATE_INDUSTRIES)),
  sectors_exclude: enumList(tuple(MANDATE_INDUSTRIES)),
  business_models: enumList(tuple(MANDATE_BUSINESS_MODELS)),
  customer_types: enumList(tuple(MANDATE_CUSTOMER_TYPES)),
});

export const mandateStageChequeSchema = z
  .object({
    stages: enumList(tuple(CANONICAL_STAGES)),
    cheque_min_aud: money,
    cheque_max_aud: money,
    lead_or_follow: z.enum(LEAD_OR_FOLLOW).nullable().default(null),
    ownership_target_pct: pct,
    followon_reserve_pct: pct,
  })
  .refine((v) => v.cheque_min_aud === null || v.cheque_max_aud === null || v.cheque_min_aud <= v.cheque_max_aud, {
    message: "cheque_min_aud must be ≤ cheque_max_aud",
    path: ["cheque_max_aud"],
  });

export const mandateGeographySchema = z.object({
  geographies: enumList(tuple(MANDATE_GEOGRAPHIES)),
});

export const mandateFloorsSchema = z.object({
  revenue_min_aud: money,
  growth_min_pct: z.number().finite().min(0).max(10_000).nullable().default(null),
  min_svi: z.number().int().min(0).max(100).nullable().default(null),
});

export const mandateTagsEsgSchema = z.object({
  tags_include: enumList(tuple(TAGS)),
  tags_exclude: enumList(tuple(TAGS)),
  esg_constraints: enumList(tuple(ESG_CONSTRAINTS)),
  risk_tolerance: z.enum(RISK_TOLERANCES).nullable().default(null),
});

export const mandateWeightsSchema = z.object({
  weights: z
    .partialRecord(z.enum(FIT_AXES_V2), z.number())
    .nullable()
    .default(null)
    .superRefine((w, ctx) => {
      const v = validateWeights(w);
      if (!v.ok) ctx.addIssue({ code: "custom", message: v.error, path: [] });
    })
    .transform((w) => {
      const v = validateWeights(w);
      return v.ok && v.overridden ? v.weights : {};
    }),
});

/** PUT / POST body — the 7 sections + optional id (PATCH) / is_default. */
export const mandateInputSchema = z.object({
  id: z.uuid().optional(),
  is_default: z.boolean().optional(),
  ...mandateIdentitySchema.shape,
  ...mandateAppetiteSchema.shape,
  ...mandateGeographySchema.shape,
  ...mandateFloorsSchema.shape,
  ...mandateTagsEsgSchema.shape,
  ...mandateWeightsSchema.shape,
  // stage & cheque carries a refine so it cannot be spread — re-declared:
  stages: enumList(tuple(CANONICAL_STAGES)),
  cheque_min_aud: money,
  cheque_max_aud: money,
  lead_or_follow: z.enum(LEAD_OR_FOLLOW).nullable().default(null),
  ownership_target_pct: pct,
  followon_reserve_pct: pct,
})
  .refine((v) => v.cheque_min_aud === null || v.cheque_max_aud === null || v.cheque_min_aud <= v.cheque_max_aud, {
    message: "cheque_min_aud must be ≤ cheque_max_aud",
    path: ["cheque_max_aud"],
  })
  .refine((v) => !v.sectors_include.some((s) => v.sectors_exclude.includes(s)), {
    message: "a sector cannot be both included and excluded",
    path: ["sectors_exclude"],
  })
  .refine((v) => !v.tags_include.some((t) => v.tags_exclude.includes(t)), {
    message: "a tag cannot be both included and excluded",
    path: ["tags_exclude"],
  });

export type MandateInput = z.infer<typeof mandateInputSchema>;
export type MandateInputRaw = z.input<typeof mandateInputSchema>;

// ─── Row types ───────────────────────────────────────────────────────────────

export interface InvestorOrganisation {
  id: string;
  slug: string;
  name: string;
  kind: MandateKind;
  owner_user_id: string | null;
  is_personal: boolean;
}

export interface InvestorMandate extends FitMandate {
  id: string;
  org_id: string | null;
  owner_user_id: string | null;
  label: string;
  thesis: string | null;
  is_default: boolean;
  discoverable: boolean;
  is_active: boolean;
  sectors_include: string[];
  sectors_exclude: string[];
  business_models: string[];
  customer_types: string[];
  stages: string[];
  lead_or_follow: LeadOrFollow | null;
  ownership_target_pct: number | null;
  followon_reserve_pct: number | null;
  geographies: string[];
  tags_include: string[];
  tags_exclude: string[];
  esg_constraints: string[];
  risk_tolerance: RiskTolerance | null;
  weights: Record<string, number>;
  created_at: string;
  updated_at: string;
}

/** Coarse legacy `investor_prefs.cheque_band` for a cheque range (mirror + founder card). */
export function chequeBandFor(min: number | null, max: number | null): "under_25k" | "25k_100k" | "100k_500k" | "500k_2m" | "2m_plus" | "any" {
  const hi = max ?? min;
  if (hi === null) return "any";
  if (hi < 25_000) return "under_25k";
  if (hi <= 100_000) return "25k_100k";
  if (hi <= 500_000) return "100k_500k";
  if (hi <= 2_000_000) return "500k_2m";
  return "2m_plus";
}
