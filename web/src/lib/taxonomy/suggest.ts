// suggestTaxonomy() — deterministic keyword / regex classifier over the fields
// the SVI / analysis intake already has (name, description, free-text
// industry, analysis rawText, detectSector slug, SVI stage, intake industry
// tags, AU state). No LLM call (G13-W1-T1 scope). Returns a suggestion with a
// per-field confidence + sources so the store can apply DQ-1 (< 0.5 → stays
// unclassified), DQ-2 (sources = auto) and DQ-4 (protected tags are never
// emitted — enforced at the type level via `SuggestableTag` and by a runtime
// filter, pinned by suggest.test.ts).
//
// Pure module — safe for the backfill script and the analysis pipeline.

import { detectSector } from "@/lib/svi-analysis";
import {
  BUSINESS_MODELS,
  INDUSTRY_PATTERNS,
  INTAKE_TAG_TO_TAG,
  TAXONOMY_VERSION,
  crosswalkIndustryDetailed,
  crosswalkStageDetailed,
  isHqState,
  isProtectedTag,
  isRegulatedByRule,
  isSuggestableTag,
  type BusinessModel,
  type CustomerType,
  type GeoScope,
  type HqState,
  type Industry,
  type StageKey,
  type SuggestableTag,
  type TaxonomyConfidence,
  type TaxonomySources,
} from "./startup-taxonomy";

/** DQ-1: auto-fill sets a value only when confidence ≥ this. */
export const AUTO_FILL_MIN_CONFIDENCE = 0.5;

/** Everything the classifier may look at. All optional; missing = no evidence. */
export interface SuggestTaxonomyInput {
  name?: string | null;
  description?: string | null;
  /** `projects.industry` — the founder's free text, or an intake / evaluator value. */
  industry?: string | null;
  /** Analysis raw input (pitch text, scraped site). Truncated to 20k chars. */
  rawText?: string | null;
  /** `analysis.sector` — the detectSector slug the SVI pipeline already computed. */
  sector?: string | null;
  /** SVI stage 0–7 (`projects.stage`, `analysis.stage`) or any legacy stage string. */
  stage?: number | string | null;
  /** Funding intake `industry_tags` (INDUSTRY_OPTIONS values). */
  industryTags?: readonly string[] | null;
  /** Explicit AU state (evaluations.state / project_grant_profiles.state). */
  state?: string | null;
}

export interface TaxonomySuggestion {
  taxonomy_version: string;
  industry: Industry;
  sub_industry: string | null;
  industry_secondary: Industry | null;
  business_model: BusinessModel;
  customer_types: CustomerType[];
  stage_key: StageKey;
  hq_state: HqState | null;
  geo_scope: GeoScope | null;
  /** Never contains a protected tag (DQ-4). */
  tags: SuggestableTag[];
  confidence: TaxonomyConfidence;
  sources: TaxonomySources;
  /** Short human-readable reasons, for the "AI suggested X" hint (E1.4). */
  evidence: string[];
  suggested_at: string;
}

// ─── Text helpers ────────────────────────────────────────────────────────────

const MAX_TEXT = 20_000;

function joinText(input: SuggestTaxonomyInput): string {
  const parts = [input.name, input.industry, input.description, input.rawText]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());
  return parts.join("\n").slice(0, MAX_TEXT);
}

function countMatches(re: RegExp, text: string): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let n = 0;
  while (g.exec(text) !== null) {
    n += 1;
    if (n >= 20) break;
    if (g.lastIndex === 0) break;
  }
  return n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ─── Industry ────────────────────────────────────────────────────────────────

interface Scored<T extends string> {
  value: T;
  score: number;
  why: string;
}

function scoreIndustries(input: SuggestTaxonomyInput, text: string): Scored<Industry>[] {
  const scores = new Map<Industry, Scored<Industry>>();
  const add = (value: Industry, score: number, why: string) => {
    if (value === "unclassified" || score <= 0) return;
    const cur = scores.get(value);
    if (cur) {
      cur.score = clamp01(cur.score + score * (1 - cur.score)); // noisy-or
      cur.why += `; ${why}`;
    } else {
      scores.set(value, { value, score: clamp01(score), why });
    }
  };

  // 1. Explicit structured values first — highest trust.
  for (const tag of input.industryTags ?? []) {
    const x = crosswalkIndustryDetailed(tag);
    if (x.industry !== "unclassified") add(x.industry, 0.9, `intake tag "${tag}"`);
  }
  if (input.industry) {
    const x = crosswalkIndustryDetailed(input.industry);
    if (x.industry !== "unclassified") add(x.industry, x.via === "regex" ? 0.6 : 0.85, `industry field "${input.industry.trim()}" (${x.via})`);
  }
  if (input.sector) {
    const x = crosswalkIndustryDetailed(input.sector);
    if (x.industry !== "unclassified") add(x.industry, 0.75, `analysis sector "${input.sector}"`);
  }

  // 2. Regex evidence over the whole text — each hit adds a little.
  if (text) {
    for (const p of INDUSTRY_PATTERNS) {
      const n = countMatches(p.re, text);
      if (n === 0) continue;
      // 1 hit → 0.35, 2 → 0.5, 3 → 0.6, 5+ → ~0.72 (log-ish saturation).
      const s = clamp01(0.2 + 0.15 * Math.log2(n + 1));
      add(p.industry, s, `${n} keyword hit${n === 1 ? "" : "s"}`);
    }
  }

  return [...scores.values()].sort((a, b) => b.score - a.score || a.value.localeCompare(b.value));
}

// ─── Business model ──────────────────────────────────────────────────────────

const BUSINESS_MODEL_PATTERNS: ReadonlyArray<{ model: Exclude<BusinessModel, "unclassified">; re: RegExp }> = [
  { model: "marketplace_platform", re: /\bmarketplace\b|\btwo[-\s]?sided\b|\bmulti[-\s]?sided\b|\btake[-\s]?rate\b|\bgmv\b|\bplatform (?:connecting|that connects|for both)\b|\bgig economy\b|\bpeer[-\s]?to[-\s]?peer\b|\bcommission on (?:each|every)\b|\bbuyers and sellers\b/i },
  { model: "transactional_fintech", re: /\bpayments? (?:platform|processing|gateway|rails)\b|\bneobank|\blending\b|\bloans?\b|\bafsl\b|\bacl\b|\bcredit licen[cs]e\b|\binsurance premiums?\b|\bunderwrit|\bremittance|\bbnpl\b|\bwallet\b|\btransaction fees?\b|\binterchange\b/i },
  { model: "biotech_regulated_pipeline", re: /\bclinical trials?\b|\bphase (?:i{1,3}|1|2|3)\b|\btga\b|\bfda\b|\bregulatory approval\b|\bdrug (?:candidate|pipeline|discovery)\b|\btherapeutic|\bpreclinical\b|\bide\b|\bmedical device approval\b/i },
  { model: "hardware_devices", re: /\bhardware\b|\bdevices?\b|\bbom\b|\bbill of materials\b|\bsensors?\b|\biot\b|\bunits? (?:sold|shipped)\b|\bmanufactur(?:e|ing) (?:our|the) (?:product|device)\b|\bprototype hardware\b|\bfirmware\b|\bwearable\b/i },
  { model: "deeptech_ip_licensing", re: /\bpatent(?:s|ed|ing)?\b|\bip licen[cs]|\blicen[cs]ing (?:model|revenue|deals?)\b|\bresearch[-\s]?heavy\b|\btrl\s?[1-9]\b|\btechnology readiness\b|\bspin[-\s]?out\b|\bpct application\b|\bnovel (?:material|process|technology)\b/i },
  { model: "ecommerce_d2c", re: /\be-?commerce\b|\bd2c\b|\bdtc\b|\bdirect[-\s]?to[-\s]?consumer\b|\bonline store\b|\bshopify\b|\bdropship|\bskus?\b|\bphysical products?\b|\bgross margin per (?:unit|order)\b|\baverage order value\b|\baov\b/i },
  { model: "saas_subscription", re: /\bsaas\b|\bsoftware[-\s]as[-\s]a[-\s]service\b|\bsubscription\b|\bmrr\b|\barr\b|\bper[-\s]seat\b|\bper user per month\b|\bannual (?:contract|licen[cs]e)\b|\brecurring revenue\b|\bfreemium\b|\bself[-\s]serve\b|\bb2b software\b/i },
  { model: "consumer_app", re: /\bconsumer app\b|\bmobile app\b|\bapp store\b|\bgoogle play\b|\bdau\b|\bmau\b|\bin[-\s]app purchases?\b|\bad[-\s]supported\b|\bdownloads\b|\busers? (?:sign|signed) up\b|\bsocial app\b/i },
  { model: "agency_consultancy", re: /\bagency\b|\bconsultanc(?:y|ies)\b|\bconsulting\b|\btime and materials\b|\bbillable hours\b|\bday rates?\b|\bretainer\b|\bstudio\b|\bprojects? for clients\b/i },
  { model: "services_enabled_tech", re: /\btech[-\s]?enabled services?\b|\bmanaged services?\b|\bdone[-\s]for[-\s]you\b|\bservice delivery\b|\bwe (?:deliver|provide) (?:the )?services?\b|\bon[-\s]demand (?:service|staff)\b|\bconcierge\b/i },
];

/** Strong industry → default model prior (exactly the DQ-1 floor, so it fills only when nothing contradicts it). */
const INDUSTRY_MODEL_PRIOR: Partial<Record<Industry, BusinessModel>> = {
  software_saas: "saas_subscription",
  ai_ml: "saas_subscription",
  cybersecurity: "saas_subscription",
  hr_worktech: "saas_subscription",
  legal_regtech_govtech: "saas_subscription",
  fintech: "transactional_fintech",
  biotech_pharma: "biotech_regulated_pipeline",
  retail_ecommerce: "ecommerce_d2c",
  advanced_manufacturing: "hardware_devices",
  deeptech_quantum: "deeptech_ip_licensing",
  space: "deeptech_ip_licensing",
  professional_services: "agency_consultancy",
};

function scoreBusinessModels(input: SuggestTaxonomyInput, text: string, industry: Industry): Scored<BusinessModel>[] {
  const scores = new Map<BusinessModel, Scored<BusinessModel>>();
  const add = (value: BusinessModel, score: number, why: string) => {
    if (value === "unclassified" || score <= 0) return;
    const cur = scores.get(value);
    if (cur) {
      cur.score = clamp01(cur.score + score * (1 - cur.score));
      cur.why += `; ${why}`;
    } else scores.set(value, { value, score: clamp01(score), why });
  };

  // The detectSector slug carries model info for three slugs (§B.2 note).
  if (input.sector === "marketplace") add("marketplace_platform", 0.7, 'analysis sector "marketplace"');
  if (input.sector === "saas") add("saas_subscription", 0.6, 'analysis sector "saas"');
  if (input.sector === "ecommerce") add("ecommerce_d2c", 0.6, 'analysis sector "ecommerce"');

  if (text) {
    for (const p of BUSINESS_MODEL_PATTERNS) {
      const n = countMatches(p.re, text);
      if (n === 0) continue;
      // 1 hit → 0.45 (below the floor), 2 → 0.54, 3 → 0.6.
      add(p.model, clamp01(0.3 + 0.15 * Math.log2(n + 1)), `${n} keyword hit${n === 1 ? "" : "s"}`);
    }
  }

  const prior = INDUSTRY_MODEL_PRIOR[industry];
  if (prior && !scores.has(prior)) add(prior, AUTO_FILL_MIN_CONFIDENCE, `industry prior (${industry})`);
  else if (prior) add(prior, 0.15, `industry prior (${industry})`);

  return [...scores.values()].sort((a, b) => b.score - a.score || BUSINESS_MODELS.indexOf(a.value) - BUSINESS_MODELS.indexOf(b.value));
}

// ─── Customer types ──────────────────────────────────────────────────────────

const CUSTOMER_PATTERNS: ReadonlyArray<{ type: Exclude<CustomerType, "unclassified">; re: RegExp }> = [
  { type: "b2b2c", re: /\bb2b2c\b|\bthrough (?:partners|employers|banks|insurers|retailers) to (?:their )?(?:customers|members|employees|consumers)\b|\bembedded (?:in|into) partner\b|\bwhite[-\s]?label(?:led)? to\b/i },
  { type: "b2g", re: /\bb2g\b|\bgovernments?\b|\bcouncils?\b|\bpublic sector\b|\bdepartment of\b|\bdefen[cs]e\b|\bagencies\b|\btenders?\b|\bgovtech\b|\bcivic\b|\bschools?\b(?=.*\b(?:department|government|public)\b)/i },
  { type: "b2b", re: /\bb2b\b|\bbusinesses\b|\benterprises?\b|\bsmes?\b|\bsmbs?\b|\bcompanies\b|\bcorporates?\b|\bclients?\b|\bfirms\b|\bteams\b|\boperators\b|\bmerchants\b|\bemployers\b|\bclinics\b|\bpractices\b|\bretailers\b|\bbrands\b|\bvendors\b/i },
  { type: "b2c", re: /\bb2c\b|\bconsumers?\b|\bindividuals?\b|\bshoppers?\b|\bhouseholds?\b|\bfamilies\b|\bparents\b|\bpatients\b|\bstudents\b|\btravellers\b|\bplayers\b|\bfans\b|\bsubscribers\b|\bend[-\s]users\b|\beveryday (?:people|australians)\b|\bapp store\b/i },
];

function scoreCustomerTypes(text: string): Scored<CustomerType>[] {
  const out: Scored<CustomerType>[] = [];
  if (!text) return out;
  for (const p of CUSTOMER_PATTERNS) {
    const n = countMatches(p.re, text);
    if (n === 0) continue;
    // 1 hit → exactly the floor (0.5), 2 → 0.59, 3 → 0.65.
    out.push({ value: p.type, score: clamp01(0.35 + 0.15 * Math.log2(n + 1)), why: `${n} hit${n === 1 ? "" : "s"}` });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ─── Geography ───────────────────────────────────────────────────────────────

const STATE_PATTERNS: ReadonlyArray<{ state: HqState; re: RegExp }> = [
  { state: "NSW", re: /\bnsw\b|\bnew south wales\b|\bsydney\b|\bnewcastle\b|\bwollongong\b/i },
  { state: "VIC", re: /\bvic\b|\bvictoria\b(?! (?:harbour|street))|\bmelbourne\b|\bgeelong\b/i },
  { state: "QLD", re: /\bqld\b|\bqueensland\b|\bbrisbane\b|\bgold coast\b|\bsunshine coast\b|\btownsville\b|\bcairns\b/i },
  { state: "WA", re: /\bwestern australia\b|\bperth\b|\bfremantle\b|\b(?:based in|hq in|from) wa\b/i },
  { state: "SA", re: /\bsouth australia\b|\badelaide\b|\b(?:based in|hq in|from) sa\b/i },
  { state: "TAS", re: /\btasmania\b|\bhobart\b|\blaunceston\b|\b(?:based in|hq in|from) tas\b/i },
  { state: "ACT", re: /\bact\b(?= (?:government|based))|\bcanberra\b|\baustralian capital territory\b|\b(?:based in|hq in) (?:the )?act\b/i },
  { state: "NT", re: /\bnorthern territory\b|\bdarwin\b|\balice springs\b|\b(?:based in|hq in|from) nt\b/i },
];

const GEO_SCOPE_PATTERNS: ReadonlyArray<{ scope: GeoScope; re: RegExp }> = [
  { scope: "global", re: /\bglobal(?:ly)?\b|\bworldwide\b|\binternational(?:ly)?\b|\b(?:us|uk|europe|north america)\b.*\b(?:market|expansion|customers)\b|\bexport(?:ing|s)?\b/i },
  { scope: "apac", re: /\bapac\b|\basia[-\s]?pacific\b|\bsouth[-\s]?east asia\b|\bsingapore\b|\bindonesia\b|\bjapan\b|\bindia\b/i },
  { scope: "anz", re: /\banz\b|\bnew zealand\b|\baustralia and nz\b|\btrans[-\s]?tasman\b/i },
  { scope: "national", re: /\bnational(?:ly|wide)?\b|\baustralia[-\s]?wide\b|\bacross australia\b|\ball (?:australian )?states\b|\baustralian market\b/i },
  { scope: "local", re: /\blocal(?:ly)?\b|\bregional\b|\bin (?:our|the) (?:city|region|town)\b|\bcommunity\b/i },
];

// ─── Tags (suggestable only — DQ-4) ──────────────────────────────────────────

const TAG_PATTERNS: ReadonlyArray<{ tag: SuggestableTag; re: RegExp; score: number }> = [
  { tag: "rdti_claimant", re: /\br&d tax incentive\b|\brdti\b|\br&d tax (?:offset|claim|refund)\b|\bausindustry (?:registration|registered)\b/i, score: 0.8 },
  { tag: "university_spinout", re: /\bspin[-\s]?out\b|\bspin[-\s]?off from\b|\buniversity of \w+|\bunsw\b|\buts\b|\bmonash\b|\bunimelb\b|\brmit\b|\bqut\b|\buq\b|\banu\b|\bresearch commerciali[sz]ation\b|\buniversity (?:ip|research)\b/i, score: 0.6 },
  { tag: "csiro_on_alumni", re: /\bcsiro on\b|\bon accelerate\b|\bon prime\b|\bcsiro'?s? on program\b/i, score: 0.8 },
  { tag: "accelerator_alumni", re: /\bstartmate\b|\by ?combinator\b|\bycombinator\b|\btechstars\b|\bantler\b|\b500 (?:startups|global)\b|\bcicada\b|\bplug and play\b|\bstone & chalk\b|\bstone and chalk\b|\bskalata\b|\baccelerator (?:alumni|graduate|program)\b|\bgraduated from .{0,40}accelerator\b|\bmuru-?d\b|\bblackbird giants\b/i, score: 0.7 },
  { tag: "impact_social_enterprise", re: /\bsocial enterprise\b|\bimpact (?:startup|venture|business|investment)\b|\bnot[-\s]for[-\s]profit\b|\bb[-\s]?corp\b|\bsocial impact\b|\bcommunity impact\b/i, score: 0.7 },
  { tag: "climate_impact", re: /\bcarbon\b|\bnet[-\s]?zero\b|\bemissions?\b|\bdecarboni|\bclimate\b|\brenewable|\bclean energy\b|\bcircular economy\b/i, score: 0.6 },
  { tag: "defence_dualuse", re: /\bdefen[cs]e\b|\bdual[-\s]?use\b|\bsovereign capabilit|\badf\b|\bmilitary\b/i, score: 0.7 },
];

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * Deterministic taxonomy suggestion. Pure; never throws on any input shape
 * (every field optional, all strings truncated). A value below
 * {@link AUTO_FILL_MIN_CONFIDENCE} is reported as `unclassified` / null with
 * its confidence still recorded, so callers can show "couldn't classify".
 */
export function suggestTaxonomy(input: SuggestTaxonomyInput | null | undefined, now: Date = new Date()): TaxonomySuggestion {
  const safe: SuggestTaxonomyInput = input && typeof input === "object" ? input : {};
  const text = joinText(safe);
  const confidence: TaxonomyConfidence = {};
  const sources: TaxonomySources = {};
  const evidence: string[] = [];

  // ── industry ──
  const industries = scoreIndustries(safe, text);
  const top = industries[0];
  let industry: Industry = "unclassified";
  let industry_secondary: Industry | null = null;
  if (top && top.score >= AUTO_FILL_MIN_CONFIDENCE) {
    industry = top.value;
    sources.industry = "auto";
    evidence.push(`industry=${top.value} (${top.why})`);
    const second = industries[1];
    if (second && second.score >= AUTO_FILL_MIN_CONFIDENCE && second.score >= top.score * 0.6) {
      industry_secondary = second.value;
      sources.industry_secondary = "auto";
      confidence.industry_secondary = round2(second.score);
    }
  } else if (top) {
    evidence.push(`industry unclassified — best guess ${top.value} at ${round2(top.score)} (< ${AUTO_FILL_MIN_CONFIDENCE})`);
  } else {
    evidence.push("industry unclassified — no evidence");
  }
  confidence.industry = round2(top?.score ?? 0);

  // ── sub_industry: the detectSector slug (explicit or re-detected) ──
  let sub_industry: string | null = null;
  const slugSource = typeof safe.sector === "string" && safe.sector.trim() ? safe.sector.trim().toLowerCase() : text ? detectSector(text) : undefined;
  if (slugSource) {
    const x = crosswalkIndustryDetailed(slugSource);
    // Keep the slug only when it agrees with the chosen industry (or industry is unclassified).
    if (x.sub_industry && (industry === "unclassified" || x.industry === industry || x.industry === industry_secondary)) {
      sub_industry = x.sub_industry;
      sources.sub_industry = "auto";
      confidence.sub_industry = round2(safe.sector ? 0.75 : 0.55);
    }
  }

  // ── business model ──
  const models = scoreBusinessModels(safe, text, industry);
  const topModel = models[0];
  let business_model: BusinessModel = "unclassified";
  if (topModel && topModel.score >= AUTO_FILL_MIN_CONFIDENCE) {
    business_model = topModel.value;
    sources.business_model = "auto";
    evidence.push(`business_model=${topModel.value} (${topModel.why})`);
  }
  confidence.business_model = round2(topModel?.score ?? 0);

  // ── customer types (multi, primary first) ──
  const cts = scoreCustomerTypes(text).filter((c) => c.score >= AUTO_FILL_MIN_CONFIDENCE);
  const customer_types: CustomerType[] = cts.map((c) => c.value).slice(0, 3);
  if (customer_types.length) {
    sources.customer_types = "auto";
    evidence.push(`customer_types=${customer_types.join(",")}`);
  }
  confidence.customer_types = round2(cts[0]?.score ?? 0);

  // ── stage ──
  const stageX = crosswalkStageDetailed(safe.stage);
  const stage_key: StageKey = stageX.stage_key;
  if (stageX.recognised) {
    sources.stage_key = "auto";
    confidence.stage_key = typeof safe.stage === "number" ? 0.9 : 0.7;
    evidence.push(`stage_key=${stage_key} (from ${JSON.stringify(safe.stage)})`);
  } else {
    confidence.stage_key = 0;
  }

  // ── hq_state ──
  let hq_state: HqState | null = null;
  const explicitState = typeof safe.state === "string" ? safe.state.trim().toUpperCase() : "";
  if (isHqState(explicitState)) {
    hq_state = explicitState;
    confidence.hq_state = 0.95;
    sources.hq_state = "auto";
  } else if (explicitState.toLowerCase() === "national") {
    hq_state = "national";
    confidence.hq_state = 0.95;
    sources.hq_state = "auto";
  } else if (text) {
    const hits = STATE_PATTERNS.map((p) => ({ state: p.state, n: countMatches(p.re, text) })).filter((h) => h.n > 0).sort((a, b) => b.n - a.n);
    if (hits.length === 1 || (hits.length > 1 && hits[0].n > hits[1].n)) {
      hq_state = hits[0].state;
      confidence.hq_state = 0.6;
      sources.hq_state = "auto";
      evidence.push(`hq_state=${hq_state} (${hits[0].n} mention${hits[0].n === 1 ? "" : "s"})`);
    } else {
      confidence.hq_state = hits.length ? 0.3 : 0;
    }
  } else {
    confidence.hq_state = 0;
  }

  // ── geo_scope ──
  let geo_scope: GeoScope | null = null;
  if (text) {
    const hits = GEO_SCOPE_PATTERNS.map((p) => ({ scope: p.scope, n: countMatches(p.re, text) })).filter((h) => h.n > 0);
    // Widest explicit scope wins (a "global ambition" mention beats a "local pilot").
    const order: GeoScope[] = ["global", "apac", "anz", "national", "local"];
    const best = order.find((s) => hits.some((h) => h.scope === s));
    if (best) {
      geo_scope = best;
      confidence.geo_scope = best === "local" ? 0.5 : 0.6;
      sources.geo_scope = "auto";
    } else confidence.geo_scope = 0;
  } else confidence.geo_scope = 0;

  // ── tags (suggestable only) ──
  const tagSet = new Map<SuggestableTag, number>();
  for (const t of safe.industryTags ?? []) {
    const mapped = INTAKE_TAG_TO_TAG[String(t).trim().toLowerCase()];
    if (mapped) tagSet.set(mapped, 0.9);
  }
  if (text) {
    for (const p of TAG_PATTERNS) {
      if (p.re.test(text)) tagSet.set(p.tag, Math.max(tagSet.get(p.tag) ?? 0, p.score));
    }
  }
  if (industry === "climate_cleantech") tagSet.set("climate_impact", Math.max(tagSet.get("climate_impact") ?? 0, 0.8));
  if (industry === "defence_dualuse") tagSet.set("defence_dualuse", Math.max(tagSet.get("defence_dualuse") ?? 0, 0.9));
  if (isRegulatedByRule(industry, business_model)) tagSet.set("regulated", 0.9);
  // `esic_eligible` needs the CFO ESIC 100-pt check + incorporation date (§B.4 vi) — never inferred from text here.
  const tags = [...tagSet.entries()]
    .filter(([tag, score]) => score >= AUTO_FILL_MIN_CONFIDENCE && isSuggestableTag(tag) && !isProtectedTag(tag))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
  if (tags.length) {
    sources.tags = Object.fromEntries(tags.map((t) => [t, "auto" as const]));
    confidence.tags = round2(Math.max(...tags.map((t) => tagSet.get(t) ?? 0)));
    evidence.push(`tags=${tags.join(",")}`);
  } else confidence.tags = 0;

  return {
    taxonomy_version: TAXONOMY_VERSION,
    industry,
    sub_industry,
    industry_secondary,
    business_model,
    customer_types,
    stage_key,
    hq_state,
    geo_scope,
    tags,
    confidence,
    sources,
    evidence: evidence.slice(0, 12),
    suggested_at: now.toISOString(),
  };
}

/** Convenience for the analysis pipeline: pull the classifier inputs off an SVIAnalysis-shaped object. */
export function suggestInputFromAnalysis(
  analysis: { sector?: string | null; stage?: number | null; rawText?: string | null } | null | undefined,
  extra: Omit<SuggestTaxonomyInput, "sector"> = {},
): SuggestTaxonomyInput {
  return {
    ...extra,
    sector: analysis?.sector ?? null,
    stage: typeof analysis?.stage === "number" ? analysis.stage : extra.stage ?? null,
    rawText: extra.rawText ?? analysis?.rawText ?? null,
  };
}
