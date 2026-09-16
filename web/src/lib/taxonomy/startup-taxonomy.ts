// Startup taxonomy — the single canonical vocabulary for industry, business
// model, stage, customer type, geography and special tags (G13-W1-T1,
// docs/plans/investor-clarity-2026-09-15/10-ba-investor-dossier-taxonomy.md
// §B.1–B.4, Appendix 3; decision D3 in the goal doc).
//
// Every legacy sector / stage vocabulary in the codebase is a *derived*
// crosswalk from this module and must never be edited independently again:
//
//   sector vocabularies
//     • `detectSector()` 25 slugs + SECTOR_LABELS   src/lib/svi-analysis.ts:94-148
//     • `Sector` 27 keys (multiples)               src/lib/valuation/sector-multiples-static.ts:17
//     • `BenchmarkSector` 9 buckets                src/lib/svi/sector-map.ts:9
//     • `INDUSTRY_OPTIONS` 22 values (intake)      src/lib/funding/intake.ts:52
//     • `SECTOR_LABEL` 8 keys (listings)           src/lib/startup-index-listings.ts:10
//     • `SECTOR_OPTS` (listings page)              src/app/startup-index/listings/page.tsx:25
//     • tools SECTORS / SECTOR_OPTIONS             src/app/tools/financial-projections/*.tsx
//     • free text  projects.industry / startup_listings.sector / svi_index_snapshots.sector
//   stage vocabularies
//     • SVI stage int 0–7 → `sviStageToCanonical`  src/lib/journey-vocabulary.ts:249
//     • `FOUNDER_STAGES` / INTAKE_STAGES           src/lib/agents/grant-advisor-rules.ts:25, src/lib/funding/intake.ts:43
//     • investor `StageBand`                       src/lib/investor-portal.ts:27
//     • benchmarks `STAGES`                        src/lib/benchmarks.ts:164
//     • `MaturityLevel`                            src/lib/agents/maturity-detector.ts:18
//     • `GrowthPhaseId` (12)                       src/lib/journey-map.ts:165 (+ GROWTH_PHASE_TO_STAGE)
//     • legacy SVI stage labels                    src/lib/svi-analysis.ts:19, src/lib/startup-index-listings.ts:21
//     • UI STAGE_OPTIONS                           dashboard/cfo/cfo-dashboard-client.tsx:200, workspace/equity-offer/request/page.tsx:21
//
// Design principles (§B.1): industry ≠ business model; ANZSIC-anchored so the
// CMO/CFO agents can cite ABS data; every axis has an explicit `unclassified`
// value ("Unclassified" is an honest state — DQ-1); protected tags are
// founder-declared only (DQ-4).
//
// Pure module: no server-only import, no DB — safe for the backfill script,
// client bundles and the analysis pipeline alike.

import { CANONICAL_STAGES, sviStageToCanonical, type StageKey } from "@/lib/journey-vocabulary";
import { GROWTH_PHASE_TO_STAGE, type GrowthPhaseId } from "@/lib/journey-map";

export const TAXONOMY_VERSION = "1.0.0";

// ─── Axis (i) industry ───────────────────────────────────────────────────────

export const INDUSTRIES = [
  "software_saas",
  "ai_ml",
  "fintech",
  "healthtech_medtech",
  "biotech_pharma",
  "climate_cleantech",
  "agtech_food",
  "advanced_manufacturing",
  "deeptech_quantum",
  "space",
  "defence_dualuse",
  "mining_resources_tech",
  "edtech",
  "proptech_construction",
  "retail_ecommerce",
  "media_creative_gaming",
  "travel_tourism_hospitality",
  "transport_logistics_mobility",
  "hr_worktech",
  "legal_regtech_govtech",
  "cybersecurity",
  "sports_wellness",
  "professional_services",
  "unclassified",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

// ─── Axis (ii) business model ────────────────────────────────────────────────

export const BUSINESS_MODELS = [
  "saas_subscription",
  "marketplace_platform",
  "transactional_fintech",
  "consumer_app",
  "ecommerce_d2c",
  "hardware_devices",
  "deeptech_ip_licensing",
  "biotech_regulated_pipeline",
  "services_enabled_tech",
  "agency_consultancy",
  "unclassified",
] as const;
export type BusinessModel = (typeof BUSINESS_MODELS)[number];

// ─── Axes (iii)–(vi) ─────────────────────────────────────────────────────────

/** Stage axis = the existing 8 canonical stages (`stage_key`). */
export { CANONICAL_STAGES };
export type { StageKey };

export const CUSTOMER_TYPES = ["b2b", "b2c", "b2b2c", "b2g", "unclassified"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

/** Mirrors `AU_STATES` in src/lib/evaluations.ts:57 (kept here so the pure module never imports server-only code). */
export const HQ_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT", "national"] as const;
export type HqState = (typeof HQ_STATES)[number];

export const GEO_SCOPES = ["local", "national", "anz", "apac", "global"] as const;
export type GeoScope = (typeof GEO_SCOPES)[number];

export const TAGS = [
  "esic_eligible",
  "rdti_claimant",
  "female_founded",
  "first_nations",
  "university_spinout",
  "climate_impact",
  "defence_dualuse",
  "regulated",
  "impact_social_enterprise",
  "csiro_on_alumni",
  "accelerator_alumni",
] as const;
export type Tag = (typeof TAGS)[number];

/** Founder-declared only — never inferred, never in `suggested` (DQ-4). */
export const PROTECTED_TAGS = ["female_founded", "first_nations"] as const;
export type ProtectedTag = (typeof PROTECTED_TAGS)[number];
/** The tags the pipeline is allowed to emit (type-level exclusion of the protected ones). */
export type SuggestableTag = Exclude<Tag, ProtectedTag>;
export const SUGGESTABLE_TAGS = TAGS.filter((t): t is SuggestableTag => !(PROTECTED_TAGS as readonly string[]).includes(t));

export const TAXONOMY_SOURCES = ["auto", "founder", "evaluator"] as const;
export type TaxonomySource = (typeof TAXONOMY_SOURCES)[number];

/** Fields of `startup_taxonomy` a source / confidence can be recorded for. */
export const TAXONOMY_FIELDS = [
  "industry",
  "sub_industry",
  "industry_secondary",
  "business_model",
  "customer_types",
  "stage_key",
  "hq_state",
  "geo_scope",
  "tags",
] as const;
export type TaxonomyField = (typeof TAXONOMY_FIELDS)[number];

/** `sources` jsonb: per-field origin; `tags` is a per-tag map. */
export type TaxonomySources = Partial<Record<Exclude<TaxonomyField, "tags">, TaxonomySource>> & {
  tags?: Partial<Record<Tag, TaxonomySource>>;
};
/** `confidence` jsonb: 0..1 per field the pipeline set. */
export type TaxonomyConfidence = Partial<Record<TaxonomyField, number>>;

/** One `startup_taxonomy` row (migration 0394). */
export interface StartupTaxonomyRow {
  project_id: string;
  taxonomy_version: string;
  industry: Industry;
  sub_industry: string | null;
  industry_secondary: Industry | null;
  business_model: BusinessModel;
  customer_types: CustomerType[];
  stage_key: StageKey;
  hq_state: HqState | null;
  hq_country: string;
  geo_scope: GeoScope | null;
  tags: Tag[];
  anzsic_division: string | null;
  anzsic_class: string | null;
  sources: TaxonomySources;
  confidence: TaxonomyConfidence;
  suggested: Record<string, unknown> | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Labels (EN / VI) ────────────────────────────────────────────────────────

export interface AxisLabel {
  en: string;
  vi: string;
}

export const INDUSTRY_LABELS: Record<Industry, AxisLabel> = {
  software_saas: { en: "Software / SaaS", vi: "Phần mềm / SaaS" },
  ai_ml: { en: "AI / machine learning", vi: "AI / học máy" },
  fintech: { en: "Fintech", vi: "Công nghệ tài chính" },
  healthtech_medtech: { en: "Healthtech / medtech", vi: "Công nghệ y tế" },
  biotech_pharma: { en: "Biotech / pharma", vi: "Công nghệ sinh học / dược" },
  climate_cleantech: { en: "Climate / cleantech", vi: "Khí hậu / công nghệ sạch" },
  agtech_food: { en: "Agtech / food", vi: "Nông nghiệp / thực phẩm" },
  advanced_manufacturing: { en: "Advanced manufacturing", vi: "Sản xuất tiên tiến" },
  deeptech_quantum: { en: "Deeptech / quantum", vi: "Deeptech / lượng tử" },
  space: { en: "Space", vi: "Không gian" },
  defence_dualuse: { en: "Defence / dual-use", vi: "Quốc phòng / lưỡng dụng" },
  mining_resources_tech: { en: "Mining / resources tech", vi: "Khai khoáng / tài nguyên" },
  edtech: { en: "Edtech", vi: "Công nghệ giáo dục" },
  proptech_construction: { en: "Proptech / construction", vi: "Bất động sản / xây dựng" },
  retail_ecommerce: { en: "Retail / e-commerce", vi: "Bán lẻ / thương mại điện tử" },
  media_creative_gaming: { en: "Media / creative / gaming", vi: "Truyền thông / sáng tạo / game" },
  travel_tourism_hospitality: { en: "Travel / tourism / hospitality", vi: "Du lịch / lưu trú" },
  transport_logistics_mobility: { en: "Transport / logistics / mobility", vi: "Vận tải / logistics" },
  hr_worktech: { en: "HR / worktech", vi: "Nhân sự / công nghệ việc làm" },
  legal_regtech_govtech: { en: "Legal / regtech / govtech", vi: "Pháp lý / regtech / govtech" },
  cybersecurity: { en: "Cybersecurity", vi: "An ninh mạng" },
  sports_wellness: { en: "Sports / wellness", vi: "Thể thao / sức khoẻ" },
  professional_services: { en: "Professional services", vi: "Dịch vụ chuyên môn" },
  unclassified: { en: "Unclassified", vi: "Chưa phân loại" },
};

export const BUSINESS_MODEL_LABELS: Record<BusinessModel, AxisLabel> = {
  saas_subscription: { en: "SaaS / subscription", vi: "SaaS / thuê bao" },
  marketplace_platform: { en: "Marketplace / platform", vi: "Sàn giao dịch / nền tảng" },
  transactional_fintech: { en: "Transactional fintech", vi: "Fintech giao dịch" },
  consumer_app: { en: "Consumer app", vi: "Ứng dụng người dùng" },
  ecommerce_d2c: { en: "E-commerce / D2C", vi: "Thương mại điện tử / D2C" },
  hardware_devices: { en: "Hardware / devices", vi: "Phần cứng / thiết bị" },
  deeptech_ip_licensing: { en: "Deeptech / IP licensing", vi: "Deeptech / cấp phép IP" },
  biotech_regulated_pipeline: { en: "Biotech / regulated pipeline", vi: "Công nghệ sinh học / quy trình cấp phép" },
  services_enabled_tech: { en: "Tech-enabled services", vi: "Dịch vụ có công nghệ hỗ trợ" },
  agency_consultancy: { en: "Agency / consultancy", vi: "Agency / tư vấn" },
  unclassified: { en: "Unclassified", vi: "Chưa phân loại" },
};

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, AxisLabel> = {
  b2b: { en: "B2B", vi: "B2B" },
  b2c: { en: "B2C", vi: "B2C" },
  b2b2c: { en: "B2B2C", vi: "B2B2C" },
  b2g: { en: "B2G (government)", vi: "B2G (chính phủ)" },
  unclassified: { en: "Unclassified", vi: "Chưa phân loại" },
};

export const GEO_SCOPE_LABELS: Record<GeoScope, AxisLabel> = {
  local: { en: "Local", vi: "Địa phương" },
  national: { en: "Australia-wide", vi: "Toàn nước Úc" },
  anz: { en: "Australia + NZ", vi: "Úc + New Zealand" },
  apac: { en: "Asia-Pacific", vi: "Châu Á – Thái Bình Dương" },
  global: { en: "Global", vi: "Toàn cầu" },
};

export const TAG_LABELS: Record<Tag, AxisLabel> = {
  esic_eligible: { en: "ESIC eligible", vi: "Đủ điều kiện ESIC" },
  rdti_claimant: { en: "R&D Tax Incentive claimant", vi: "Nhận ưu đãi thuế R&D" },
  female_founded: { en: "Female founded", vi: "Nhà sáng lập nữ" },
  first_nations: { en: "First Nations founded", vi: "Nhà sáng lập First Nations" },
  university_spinout: { en: "University spin-out", vi: "Spin-out từ đại học" },
  climate_impact: { en: "Climate impact", vi: "Tác động khí hậu" },
  defence_dualuse: { en: "Defence / dual-use", vi: "Quốc phòng / lưỡng dụng" },
  regulated: { en: "Regulated", vi: "Chịu quản lý" },
  impact_social_enterprise: { en: "Impact / social enterprise", vi: "Doanh nghiệp xã hội" },
  csiro_on_alumni: { en: "CSIRO ON alumni", vi: "Cựu học viên CSIRO ON" },
  accelerator_alumni: { en: "Accelerator alumni", vi: "Cựu học viên accelerator" },
};

// ─── ANZSIC anchors (ABS 2006 rev 2.0) — §B.2 column 3 ───────────────────────

export interface AnzsicAnchor {
  /** Division letter A..S, null for unclassified. */
  division: string | null;
  /** Optional 4-digit class codes named in the spec. */
  classes: string[];
  note: string;
}

export const INDUSTRY_ANZSIC: Record<Industry, AnzsicAnchor> = {
  software_saas: { division: "J", classes: ["5910", "5920", "7000"], note: "J Internet publishing / M 7000 Computer system design" },
  ai_ml: { division: "M", classes: ["7000", "6910"], note: "M 7000 / 6910" },
  fintech: { division: "K", classes: [], note: "K 62 Finance, 63 Insurance, 64 Auxiliary" },
  healthtech_medtech: { division: "Q", classes: [], note: "Q 85 Medical & other health care" },
  biotech_pharma: { division: "M", classes: ["6910", "1841"], note: "M 6910 Scientific research; C 1841 Pharmaceutical mfg" },
  climate_cleantech: { division: "D", classes: [], note: "D 26 Electricity, 29 Waste; M 6910" },
  agtech_food: { division: "A", classes: [], note: "A 01 Agriculture; C 11 Food product mfg" },
  advanced_manufacturing: { division: "C", classes: [], note: "C 24 Machinery & equipment mfg" },
  deeptech_quantum: { division: "M", classes: ["6910"], note: "M 6910" },
  space: { division: "M", classes: ["6910", "2394"], note: "M 6910; C 2394 Aircraft mfg" },
  defence_dualuse: { division: "O", classes: ["7600"], note: "O 7600 Defence; C 24" },
  mining_resources_tech: { division: "B", classes: ["1010"], note: "B 06–10 Mining; 1010 exploration" },
  edtech: { division: "P", classes: [], note: "P 80–82 Education & training" },
  proptech_construction: { division: "L", classes: ["6720"], note: "L 6720 Real estate services; E 30–32 Construction" },
  retail_ecommerce: { division: "G", classes: [], note: "G 39–43 Retail trade" },
  media_creative_gaming: { division: "J", classes: [], note: "J 55–57 Publishing/broadcasting; R 90 Creative arts" },
  travel_tourism_hospitality: { division: "H", classes: ["7220"], note: "H 44–45 Accommodation & food services; N 7220 Travel agency" },
  transport_logistics_mobility: { division: "I", classes: [], note: "I 46–53 Transport, postal & warehousing" },
  hr_worktech: { division: "N", classes: ["7211", "7212"], note: "N 7211 Employment placement, 7212 Labour supply" },
  legal_regtech_govtech: { division: "M", classes: ["6931"], note: "M 6931 Legal services; O 75 Public administration" },
  cybersecurity: { division: "M", classes: ["7000", "5910"], note: "M 7000 / J 5910" },
  sports_wellness: { division: "R", classes: [], note: "R 91 Sports & recreation" },
  professional_services: { division: "M", classes: [], note: "M 69 Professional, scientific & technical" },
  unclassified: { division: null, classes: [], note: "—" },
};

// ─── Legacy → canonical crosswalks (§B.2 columns 4–8) ─────────────────────────

/**
 * Every legacy sector value, lower-cased, → canonical industry. Values that
 * are *not* industries (`marketplace`, `consumer`, `hardware`, `default`,
 * `social_enterprise`) map to `unclassified` here and are picked up by
 * {@link crosswalkBusinessModel} / the `impact_social_enterprise` tag instead.
 */
export const LEGACY_SECTOR_TO_INDUSTRY: Readonly<Record<string, Industry>> = {
  // detectSector slugs (svi-analysis.ts) + sector-multiples keys
  saas: "software_saas",
  ai: "ai_ml",
  fintech: "fintech",
  wealthtech: "fintech",
  insurtech: "fintech",
  healthtech: "healthtech_medtech",
  biotech: "biotech_pharma",
  cleantech: "climate_cleantech",
  agtech: "agtech_food",
  deeptech: "deeptech_quantum",
  spacetech: "space",
  edtech: "edtech",
  proptech: "proptech_construction",
  constructiontech: "proptech_construction",
  ecommerce: "retail_ecommerce",
  retailtech: "retail_ecommerce",
  mediatech: "media_creative_gaming",
  gaming: "media_creative_gaming",
  traveltech: "travel_tourism_hospitality",
  logisticstech: "transport_logistics_mobility",
  hrtech: "hr_worktech",
  legaltech: "legal_regtech_govtech",
  govtech: "legal_regtech_govtech",
  cybertech: "cybersecurity",
  sportstech: "sports_wellness",
  marketplace: "unclassified", // business model, not an industry
  default: "unclassified",
  // BenchmarkSector buckets (svi/sector-map.ts)
  climatetech: "climate_cleantech",
  hardware: "unclassified", // business model bucket (agtech / manufacturing / mining share it)
  consumer: "unclassified", // customer type / business model bucket
  // INDUSTRY_OPTIONS (funding/intake.ts) — values not already canonical
  cleantech_renewables: "climate_cleantech",
  climate: "climate_cleantech",
  quantum: "deeptech_quantum",
  creative_media: "media_creative_gaming",
  tourism_hospitality: "travel_tourism_hospitality",
  construction: "proptech_construction",
  transport_logistics: "transport_logistics_mobility",
  social_enterprise: "unclassified", // tag impact_social_enterprise, not an industry
  // common free-text aliases seen in projects.industry
  software: "software_saas",
  "software / saas": "software_saas",
  "saas / software": "software_saas",
  "b2b saas": "software_saas",
  "artificial intelligence": "ai_ml",
  "machine learning": "ai_ml",
  "financial services": "fintech",
  finance: "fintech",
  insurance: "fintech",
  health: "healthtech_medtech",
  healthcare: "healthtech_medtech",
  medtech: "healthtech_medtech",
  pharma: "biotech_pharma",
  "life sciences": "biotech_pharma",
  energy: "climate_cleantech",
  renewables: "climate_cleantech",
  sustainability: "climate_cleantech",
  agriculture: "agtech_food",
  foodtech: "agtech_food",
  food: "agtech_food",
  manufacturing: "advanced_manufacturing",
  robotics: "advanced_manufacturing",
  defence: "defence_dualuse",
  defense: "defence_dualuse",
  mining: "mining_resources_tech",
  resources: "mining_resources_tech",
  education: "edtech",
  "real estate": "proptech_construction",
  property: "proptech_construction",
  retail: "retail_ecommerce",
  "e-commerce": "retail_ecommerce",
  media: "media_creative_gaming",
  entertainment: "media_creative_gaming",
  creative: "media_creative_gaming",
  travel: "travel_tourism_hospitality",
  tourism: "travel_tourism_hospitality",
  hospitality: "travel_tourism_hospitality",
  logistics: "transport_logistics_mobility",
  transport: "transport_logistics_mobility",
  mobility: "transport_logistics_mobility",
  hr: "hr_worktech",
  recruitment: "hr_worktech",
  legal: "legal_regtech_govtech",
  regtech: "legal_regtech_govtech",
  government: "legal_regtech_govtech",
  cybersecurity: "cybersecurity",
  security: "cybersecurity",
  sports: "sports_wellness",
  fitness: "sports_wellness",
  wellness: "sports_wellness",
  consulting: "professional_services",
  services: "professional_services",
  other: "unclassified",
  unknown: "unclassified",
  none: "unclassified",
};

/** detectSector slug → canonical industry (the `sub_industry` column keeps the slug). */
export const SUB_INDUSTRY_TO_INDUSTRY = LEGACY_SECTOR_TO_INDUSTRY;

/** The 25 slugs `detectSector()` (svi-analysis.ts:122) can return — the `sub_industry` vocabulary. */
export const DETECT_SECTOR_SLUGS = [
  "healthtech", "biotech", "fintech", "wealthtech", "insurtech", "edtech", "deeptech", "legaltech", "proptech",
  "hrtech", "agtech", "cleantech", "spacetech", "constructiontech", "cybertech", "logisticstech", "retailtech",
  "govtech", "sportstech", "traveltech", "mediatech", "gaming", "marketplace", "ecommerce", "saas",
] as const;
export type DetectSectorSlug = (typeof DETECT_SECTOR_SLUGS)[number];
export function isDetectSectorSlug(v: unknown): v is DetectSectorSlug {
  return typeof v === "string" && (DETECT_SECTOR_SLUGS as readonly string[]).includes(v);
}

/** Canonical industry → sector-multiples key (§B.2 column 5; `marketplace` business model overrides — see {@link multiplesKeyFor}). */
export const INDUSTRY_TO_MULTIPLES_KEY: Record<Industry, string> = {
  software_saas: "saas",
  ai_ml: "ai",
  fintech: "fintech",
  healthtech_medtech: "healthtech",
  biotech_pharma: "biotech",
  climate_cleantech: "cleantech",
  agtech_food: "agtech",
  advanced_manufacturing: "deeptech",
  deeptech_quantum: "deeptech",
  space: "spacetech",
  defence_dualuse: "deeptech",
  mining_resources_tech: "default",
  edtech: "edtech",
  proptech_construction: "proptech",
  retail_ecommerce: "ecommerce",
  media_creative_gaming: "mediatech",
  travel_tourism_hospitality: "traveltech",
  transport_logistics_mobility: "logisticstech",
  hr_worktech: "hrtech",
  legal_regtech_govtech: "legaltech",
  cybersecurity: "cybertech",
  sports_wellness: "sportstech",
  professional_services: "default",
  unclassified: "default",
};

/** Canonical industry → cohort benchmark bucket (§B.2 column 6). */
export const INDUSTRY_TO_BENCHMARK_SECTOR: Record<Industry, string> = {
  software_saas: "saas",
  ai_ml: "saas",
  fintech: "fintech",
  healthtech_medtech: "healthtech",
  biotech_pharma: "healthtech",
  climate_cleantech: "climatetech",
  agtech_food: "hardware",
  advanced_manufacturing: "hardware",
  deeptech_quantum: "deeptech",
  space: "deeptech",
  defence_dualuse: "deeptech",
  mining_resources_tech: "hardware",
  edtech: "default",
  proptech_construction: "default",
  retail_ecommerce: "consumer",
  media_creative_gaming: "consumer",
  travel_tourism_hospitality: "consumer",
  transport_logistics_mobility: "default",
  hr_worktech: "saas",
  legal_regtech_govtech: "saas",
  cybersecurity: "saas",
  sports_wellness: "consumer",
  professional_services: "default",
  unclassified: "default",
};

/** Canonical industry → listings `SECTOR_LABEL` key (§B.2 column 8). */
export const INDUSTRY_TO_LISTING_SECTOR: Record<Industry, string> = {
  software_saas: "saas",
  ai_ml: "ai",
  fintech: "fintech",
  healthtech_medtech: "healthtech",
  biotech_pharma: "healthtech",
  climate_cleantech: "default",
  agtech_food: "default",
  advanced_manufacturing: "deeptech",
  deeptech_quantum: "deeptech",
  space: "deeptech",
  defence_dualuse: "deeptech",
  mining_resources_tech: "default",
  edtech: "default",
  proptech_construction: "default",
  retail_ecommerce: "ecommerce",
  media_creative_gaming: "default",
  travel_tourism_hospitality: "default",
  transport_logistics_mobility: "default",
  hr_worktech: "saas",
  legal_regtech_govtech: "saas",
  cybersecurity: "saas",
  sports_wellness: "default",
  professional_services: "default",
  unclassified: "default",
};

/** Canonical industry → the intake `INDUSTRY_OPTIONS` value (§B.2 column 7); null where intake has no option. */
export const INDUSTRY_TO_INTAKE_OPTION: Record<Industry, string | null> = {
  software_saas: "software_saas",
  ai_ml: "ai_ml",
  fintech: "fintech",
  healthtech_medtech: "healthtech_medtech",
  biotech_pharma: "biotech_pharma",
  climate_cleantech: "cleantech_renewables",
  agtech_food: "agtech_food",
  advanced_manufacturing: "advanced_manufacturing",
  deeptech_quantum: "quantum",
  space: "space",
  defence_dualuse: "defence_dualuse",
  mining_resources_tech: "mining_resources_tech",
  edtech: "edtech",
  proptech_construction: "proptech",
  retail_ecommerce: "retail_ecommerce",
  media_creative_gaming: "creative_media",
  travel_tourism_hospitality: "tourism_hospitality",
  transport_logistics_mobility: "transport_logistics",
  hr_worktech: "professional_services",
  legal_regtech_govtech: "professional_services",
  cybersecurity: null,
  sports_wellness: null,
  professional_services: "professional_services",
  unclassified: null,
};

/**
 * Sector-multiples resolver key (§B.2 note): `sub_industry ?? crosswalk(industry)`,
 * with `business_model = marketplace_platform` overriding to `marketplace`.
 */
export function multiplesKeyFor(t: Pick<StartupTaxonomyRow, "industry" | "business_model"> & { sub_industry?: string | null }): string {
  if (t.business_model === "marketplace_platform") return "marketplace";
  if (t.sub_industry && t.sub_industry !== "marketplace") return t.sub_industry;
  return INDUSTRY_TO_MULTIPLES_KEY[t.industry] ?? "default";
}

// ─── E1.5 — legacy writers through the crosswalk ─────────────────────────────
//
// The legacy `sector` columns (`svi_index_snapshots.sector`,
// `startup_listings.sector`, `analysis.sector`) carry the detectSector slug
// vocabulary plus the listing keys. Writers now normalise through here so a
// free-text value ("B2B SaaS platform", "Climate tech / hardware") lands as
// the canonical slug and an unknown value lands as NULL — never as a guess
// (DQ-1). A slug that is already canonical is returned byte-identical so
// tickers / filters keyed on it stay stable.

/** Listing `SECTOR_LABEL` keys (startup-index-listings.ts) — kept verbatim. */
export const LISTING_SECTOR_KEYS = ["saas", "fintech", "ai", "healthtech", "marketplace", "deeptech", "ecommerce", "default"] as const;

/** Any legacy / free-text sector → the canonical legacy slug, or null when unclassified. */
export function canonicalSectorSlug(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (isDetectSectorSlug(s) || (LISTING_SECTOR_KEYS as readonly string[]).includes(s)) return s;
  const x = crosswalkIndustryDetailed(s);
  if (x.industry === "unclassified") return null;
  if (x.sub_industry) return x.sub_industry;
  const key = INDUSTRY_TO_MULTIPLES_KEY[x.industry];
  return key === "default" ? null : key;
}

/** True when a human (founder / evaluator) owns the industry axis or confirmed the row — the T7 "confirmed taxonomy" condition. */
export function isTaxonomyHumanOwned(t: Pick<StartupTaxonomyRow, "sources" | "confirmed_at"> | null | undefined): boolean {
  if (!t) return false;
  if (t.confirmed_at) return true;
  const src = t.sources?.industry;
  return src === "founder" || src === "evaluator";
}

/** The legacy `sector` slug a taxonomy row crosswalks to (T7); null for an unclassified industry without a marketplace model. */
export function legacySectorSlugFor(t: Pick<StartupTaxonomyRow, "industry" | "business_model"> & { sub_industry?: string | null }): string | null {
  if (t.business_model === "marketplace_platform") return "marketplace";
  if (t.industry === "unclassified") return null;
  const key = multiplesKeyFor(t);
  return key === "default" ? null : key;
}

/** Human label for a legacy listing sector slug: SECTOR_LABEL keys keep their label; anything else is the canonical industry label, or "Unclassified" (T1 — never "Other"). */
export function legacySectorLabel(sector: string | null | undefined, legacyLabels: Readonly<Record<string, string>>, locale: TaxonomyLocale = "en"): string {
  const s = (sector ?? "").trim().toLowerCase();
  if (s && s !== "default" && legacyLabels[s]) return legacyLabels[s];
  return industryLabel(crosswalkIndustry(s), locale);
}

// ─── Free-text industry patterns (§B.2 "NEW regex" rows + the rest) ──────────
//
// Ordered most-specific first. Each pattern is tried against the whole text;
// `crosswalkIndustry()` uses the first hit, `suggestTaxonomy()` scores every
// hit. Regexes are intentionally conservative — an unknown industry must stay
// `unclassified` rather than be guessed (DQ-1).

export const INDUSTRY_PATTERNS: ReadonlyArray<{ industry: Exclude<Industry, "unclassified">; re: RegExp }> = [
  { industry: "defence_dualuse", re: /\bdefen[cs]e\b|dual[-\s]?use\b|sovereign capabilit|\badf\b|\bmilitary\b|\bcounter[-\s]?drone\b/i },
  { industry: "space", re: /\bspace[-\s]?tech\b|\bsatellite|\blaunch vehicle|\baerospace\b|\borbital\b|\bcubesat\b|\bspace (?:industry|sector|agency)\b/i },
  { industry: "mining_resources_tech", re: /\bmining\b|\bmets\b|\bmine sites?\b|\bexploration (?:data|drilling|tech)|\bresources sector\b|\bore\b|\biron ore\b|\bcritical minerals?\b/i },
  { industry: "biotech_pharma", re: /\bbio[-\s]?tech\b|\bbiotechnology\b|\blife[-\s]?science|\bgenomic|\bcrispr\b|\bpharma(?:ceutical)?\b|\bdrug (?:discovery|development)|\btherapeutic|\bvaccine|\bcell therapy|\bmolecul/i },
  { industry: "healthtech_medtech", re: /\bhealth[-\s]?tech\b|\bmed[-\s]?tech\b|\bdigital health\b|\btelehealth\b|\bclinic(?:al|s)?\b|\bpatients?\b|\bhospital|\bmedical\b|\bhealthcare\b|\ballied health\b|\bmental health\b|\baged care\b|\bndis\b|\btga\b/i },
  { industry: "climate_cleantech", re: /\bclean[-\s]?tech\b|\bclimate[-\s]?tech\b|\bclimate\b|\brenewable|\bcarbon\b|\bnet[-\s]?zero\b|\bemissions?\b|\bsolar\b|\bbattery|\bsustainab|\bcircular economy\b|\bwaste\b|\benergy (?:storage|transition|grid)|\bhydrogen\b|\bev charging\b/i },
  { industry: "agtech_food", re: /\bag[-\s]?tech\b|\bagri(?:culture|business|food)?\b|\bfarm(?:ers?|ing)?\b|\bfood[-\s]?tech\b|\bcrop|\blivestock\b|\baquaculture\b|\bhorticulture\b|\bfood (?:production|manufactur|supply)/i },
  { industry: "advanced_manufacturing", re: /\badvanced manufactur|\bmanufactur(?:ing|er)\b|\brobotic|\bindustrial automation\b|\b3d[-\s]?print|\badditive manufactur|\bcnc\b|\bfactory\b|\bindustry 4\.0\b/i },
  { industry: "deeptech_quantum", re: /\bdeep[-\s]?tech\b|\bquantum\b|\bphotonic|\bsemiconductor|\bfrontier tech|\badvanced materials?\b|\bnanotech/i },
  { industry: "ai_ml", re: /\bai\b|\bartificial intelligence\b|\bmachine learning\b|\bllms?\b|\bgen(?:erative)?[-\s]?ai\b|\bdeep learning\b|\bcomputer vision\b|\bnlp\b|\bfoundation models?\b|\bagentic\b/i },
  { industry: "cybersecurity", re: /\bcyber[-\s]?security\b|\bcyber[-\s]?tech\b|\binfosec\b|\bzero[-\s]?trust\b|\bdevsecops\b|\bpenetration test|\bthreat detection\b|\bsecurity operations\b|\bidentity (?:and )?access\b/i },
  { industry: "fintech", re: /\bfin[-\s]?tech\b|\bfinancial (?:technology|services)\b|\bneobank|\bpayments?\b|\bafsl\b|\bopen banking\b|\blending\b|\bcredit\b|\bcrypto|\bblockchain\b|\bwealth[-\s]?tech\b|\binsur[-\s]?tech\b|\binsurance\b|\bsuperannuation\b|\bbnpl\b|\bremittance/i },
  { industry: "edtech", re: /\bed[-\s]?tech\b|\beducation(?:al)?\b|\be-?learning\b|\blms\b|\bonline course|\btutoring\b|\bcurriculum\b|\bschools?\b|\bstudents?\b|\buniversities\b|\bupskilling\b/i },
  { industry: "legal_regtech_govtech", re: /\blegal[-\s]?tech\b|\blaw[-\s]?tech\b|\breg[-\s]?tech\b|\bgov[-\s]?tech\b|\bcivic[-\s]?tech\b|\blaw firms?\b|\bcontract automation\b|\bcompliance (?:software|platform|automation)\b|\bpublic sector\b|\bcouncils?\b|\bgovernment (?:agencies|services|software)\b/i },
  { industry: "hr_worktech", re: /\bhr[-\s]?tech\b|\bhuman resources\b|\bpayroll\b|\brecruit(?:ment|ing|ers?)\b|\btalent (?:acquisition|platform|marketplace)\b|\bworkforce\b|\bfuture of work\b|\bemployee (?:engagement|experience|benefits)\b|\bhiring platform\b/i },
  { industry: "proptech_construction", re: /\bprop[-\s]?tech\b|\breal estate\b|\bproperty (?:management|tech|market)\b|\brental|\blandlords?\b|\btenants?\b|\bconstruction\b|\bcon[-\s]?tech\b|\bbuilding (?:management|sites?)\b|\bbim\b|\bsmart buildings?\b|\bbuilders?\b|\btrades(?:people|ies)?\b/i },
  { industry: "transport_logistics_mobility", re: /\blogistic|\bsupply[-\s]?chain\b|\bfreight\b|\blast[-\s]?mile\b|\bfulfil(?:l)?ment\b|\bwarehous|\bfleet\b|\bmobility\b|\bride[-\s]?shar|\bdelivery network\b|\btrucking\b|\bshipping\b/i },
  { industry: "travel_tourism_hospitality", re: /\btravel[-\s]?tech\b|\btourism\b|\bhospitality\b|\bhotels?\b|\bbooking platform\b|\bflights?\b|\baccommodation\b|\brestaurants?\b|\bcaf[eé]s?\b|\bvenues?\b|\btravellers?\b/i },
  { industry: "retail_ecommerce", re: /\be-?commerce\b|\bd2c\b|\bdtc\b|\bdirect[-\s]?to[-\s]?consumer\b|\bonline store\b|\bshopify\b|\bdropship|\bretail(?:ers?|[-\s]?tech)?\b|\bpoint of sale\b|\bpos\b|\bomnichannel\b|\bconsumer (?:goods|brand|products)\b/i },
  { industry: "media_creative_gaming", re: /\bmedia[-\s]?tech\b|\bcreators?\b|\bcontent platform\b|\bstreaming\b|\bpodcast|\bnewsletter|\bgaming\b|\bgame (?:studio|developer)|\bvideo games?\b|\besports?\b|\bmetaverse\b|\bmusic\b|\bfilm\b|\bpublishing\b|\badvertising\b|\bcreative (?:industries|agency)\b/i },
  { industry: "sports_wellness", re: /\bsports?[-\s]?tech\b|\bfitness\b|\bwearables?\b|\bathletes?\b|\bsports? (?:analytics|clubs?|teams?)\b|\bwellness\b|\bwellbeing\b|\bgyms?\b|\bnutrition\b|\bsleep\b/i },
  { industry: "software_saas", re: /\bsaas\b|\bsoftware[-\s]as[-\s]a[-\s]service\b|\bb2b software\b|\bsubscription software\b|\bdev(?:eloper)? tools?\b|\bapi platform\b|\bworkflow (?:automation|software)\b|\bcloud (?:platform|software)\b|\bsoftware platform\b|\bsoftware\b/i },
  { industry: "professional_services", re: /\bprofessional services\b|\bconsult(?:ing|ancy)\b|\baccounting firm\b|\badvisory firm\b|\bbookkeeping\b|\bmanaged services?\b/i },
];

// ─── Normalisation ───────────────────────────────────────────────────────────

function normaliseKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[‐-―]/g, "-") // unicode dashes
    .replace(/\s*[/&+,]\s*/g, " / ")
    .replace(/\s+/g, " ");
}

function snakeKey(raw: string): string {
  return normaliseKey(raw).replace(/[\s/-]+/g, "_").replace(/^_+|_+$/g, "");
}

export function isIndustry(v: unknown): v is Industry {
  return typeof v === "string" && (INDUSTRIES as readonly string[]).includes(v);
}
export function isBusinessModel(v: unknown): v is BusinessModel {
  return typeof v === "string" && (BUSINESS_MODELS as readonly string[]).includes(v);
}
export function isStageKey(v: unknown): v is StageKey {
  return typeof v === "string" && (CANONICAL_STAGES as readonly string[]).includes(v);
}
export function isCustomerType(v: unknown): v is CustomerType {
  return typeof v === "string" && (CUSTOMER_TYPES as readonly string[]).includes(v);
}
export function isHqState(v: unknown): v is HqState {
  return typeof v === "string" && (HQ_STATES as readonly string[]).includes(v);
}
export function isGeoScope(v: unknown): v is GeoScope {
  return typeof v === "string" && (GEO_SCOPES as readonly string[]).includes(v);
}
export function isTag(v: unknown): v is Tag {
  return typeof v === "string" && (TAGS as readonly string[]).includes(v);
}
export function isProtectedTag(v: unknown): v is ProtectedTag {
  return typeof v === "string" && (PROTECTED_TAGS as readonly string[]).includes(v);
}
export function isSuggestableTag(v: unknown): v is SuggestableTag {
  return isTag(v) && !isProtectedTag(v);
}

// ─── crosswalkIndustry ───────────────────────────────────────────────────────

export type IndustryMatchVia = "canonical" | "legacy" | "regex" | "none";

export interface IndustryCrosswalk {
  industry: Industry;
  /** The detectSector-style slug when the input was one (kept in `sub_industry`). */
  sub_industry: string | null;
  via: IndustryMatchVia;
}

/**
 * Map any sector / industry value from any legacy vocabulary — or free text —
 * to a canonical industry. Never throws; unknown → `unclassified`.
 */
export function crosswalkIndustryDetailed(raw: string | null | undefined): IndustryCrosswalk {
  if (typeof raw !== "string") return { industry: "unclassified", sub_industry: null, via: "none" };
  const trimmed = raw.trim();
  if (!trimmed) return { industry: "unclassified", sub_industry: null, via: "none" };

  const snake = snakeKey(trimmed);
  if (isIndustry(snake)) return { industry: snake, sub_industry: isDetectSectorSlug(snake) ? snake : null, via: "canonical" };

  const norm = normaliseKey(trimmed);
  const legacy = LEGACY_SECTOR_TO_INDUSTRY[snake] ?? LEGACY_SECTOR_TO_INDUSTRY[norm];
  if (legacy) {
    return { industry: legacy, sub_industry: isDetectSectorSlug(snake) && legacy !== "unclassified" ? snake : null, via: "legacy" };
  }

  // Free text (projects.industry / startup_listings.sector / svi_index_snapshots.sector).
  if (trimmed.length <= 200) {
    for (const p of INDUSTRY_PATTERNS) {
      if (p.re.test(trimmed)) return { industry: p.industry, sub_industry: null, via: "regex" };
    }
  }
  return { industry: "unclassified", sub_industry: null, via: "none" };
}

export function crosswalkIndustry(raw: string | null | undefined): Industry {
  return crosswalkIndustryDetailed(raw).industry;
}

// ─── crosswalkStage ──────────────────────────────────────────────────────────

/** Investor `StageBand` → the canonical stages it covers (§B.4 iii). */
export const STAGE_BAND_TO_STAGE_KEYS: Readonly<Record<string, readonly StageKey[]>> = {
  pre_seed: ["idea", "validation", "mvp_early_revenue"],
  seed: ["seed"],
  series_a: ["series_a"],
  series_b: ["series_b_c"],
  growth: ["late_stage", "public_exit"],
  any: CANONICAL_STAGES,
};

/** Legacy stage strings (snake_case, lower) → canonical stage. */
export const LEGACY_STAGE_TO_STAGE_KEY: Readonly<Record<string, StageKey>> = {
  // FOUNDER_STAGES / INTAKE_STAGES (grant-advisor-rules.ts, funding/intake.ts)
  idea: "idea",
  pre_revenue_prototype: "validation",
  mvp: "mvp_early_revenue",
  early_revenue: "mvp_early_revenue",
  scaling: "seed",
  export_ready: "series_a",
  // investor StageBand (investor-portal.ts) — representative single stage
  pre_seed: "mvp_early_revenue",
  preseed: "mvp_early_revenue",
  seed: "seed",
  series_a: "series_a",
  series_b: "series_b_c",
  growth: "series_b_c", // SVI stage 5 "Growth" (stored data) wins over the investor band's {late_stage, public_exit}
  any: "idea",
  // benchmarks STAGES keys + UI STAGE_OPTIONS (cfo dashboard, equity-offer)
  series_b_plus: "series_b_c",
  series_a_plus: "series_a",
  series_c: "series_b_c",
  series_d: "late_stage",
  validation: "validation",
  launch: "mvp_early_revenue",
  scale: "late_stage", // SVI stage 6 "Scale"
  late_stage: "late_stage",
  late: "late_stage",
  pre_ipo: "late_stage",
  ipo: "public_exit",
  public: "public_exit",
  public_exit: "public_exit",
  exit: "public_exit",
  // MaturityLevel (agents/maturity-detector.ts)
  early: "mvp_early_revenue",
  established: "late_stage",
  // legacy SVI stage labels (svi-analysis.ts LEGACY_SVI_STAGE_LABELS) + listings STAGE_LABEL
  concept: "idea",
  validated_idea: "validation",
  validated: "validation",
  mvp_prototype: "mvp_early_revenue",
  prototype: "mvp_early_revenue",
  early_traction: "seed",
  traction: "seed",
  revenue: "series_a",
  corporation: "public_exit",
  mature: "public_exit",
  // free-text aliases
  pre_revenue: "validation",
  bootstrapped: "mvp_early_revenue",
  angel: "seed",
  series_b_c: "series_b_c",
  mvp_early_revenue: "mvp_early_revenue",
};

/**
 * Map any stage value — SVI int 0–7, FOUNDER_STAGES, StageBand, benchmark keys,
 * MaturityLevel, GrowthPhaseId, legacy labels, UI options — to a canonical
 * stage. Never throws; unknown → `idea` (the safe, earliest bucket, matching
 * `sviStageToCanonical`'s own fallback). Use {@link crosswalkStageDetailed}
 * when you need to know whether the input was recognised.
 */
export function crosswalkStage(raw: string | number | null | undefined): StageKey {
  return crosswalkStageDetailed(raw).stage_key;
}

export function crosswalkStageDetailed(raw: string | number | null | undefined): { stage_key: StageKey; recognised: boolean } {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { stage_key: "idea", recognised: false };
    const n = Math.round(raw);
    return { stage_key: sviStageToCanonical(n), recognised: n >= 0 && n <= 7 };
  }
  if (typeof raw !== "string") return { stage_key: "idea", recognised: false };
  const trimmed = raw.trim();
  if (!trimmed) return { stage_key: "idea", recognised: false };
  if (/^\d+$/.test(trimmed)) return crosswalkStageDetailed(Number(trimmed));

  const snake = snakeKey(trimmed.replace(/\+/g, " plus")).replace(/^stage_/, "");
  if (isStageKey(snake)) return { stage_key: snake, recognised: true };
  const legacy = LEGACY_STAGE_TO_STAGE_KEY[snake];
  if (legacy) return { stage_key: legacy, recognised: true };
  const phase = GROWTH_PHASE_TO_STAGE[snake as GrowthPhaseId];
  if (phase) return { stage_key: phase, recognised: true };

  // Loose free-text synonyms ("Seed round", "raising a Series A", "pre-seed stage").
  const s = snake;
  if (/series_a/.test(s)) return { stage_key: "series_a", recognised: true };
  if (/series_(b|c)/.test(s)) return { stage_key: "series_b_c", recognised: true };
  if (/series_[d-z]/.test(s)) return { stage_key: "late_stage", recognised: true };
  if (/pre_?seed/.test(s)) return { stage_key: "mvp_early_revenue", recognised: true };
  if (/\bseed/.test(s) || /^seed/.test(s)) return { stage_key: "seed", recognised: true };
  if (/ipo|listed|public/.test(s)) return { stage_key: "public_exit", recognised: true };
  if (/late/.test(s)) return { stage_key: "late_stage", recognised: true };
  if (/growth/.test(s)) return { stage_key: "series_b_c", recognised: true };
  if (/mvp|prototype|early_revenue|beta|launch/.test(s)) return { stage_key: "mvp_early_revenue", recognised: true };
  if (/validat|pre_revenue|discovery/.test(s)) return { stage_key: "validation", recognised: true };
  if (/idea|concept/.test(s)) return { stage_key: "idea", recognised: true };
  return { stage_key: "idea", recognised: false };
}

// ─── crosswalkBusinessModel ──────────────────────────────────────────────────

/** Legacy sector / model strings (snake_case, lower) → business model. */
export const LEGACY_TO_BUSINESS_MODEL: Readonly<Record<string, BusinessModel>> = {
  // detectSector / multiples / benchmark / listings keys
  saas: "saas_subscription",
  marketplace: "marketplace_platform",
  ecommerce: "ecommerce_d2c",
  retailtech: "ecommerce_d2c",
  retail_ecommerce: "ecommerce_d2c",
  consumer: "consumer_app",
  gaming: "consumer_app",
  hardware: "hardware_devices",
  advanced_manufacturing: "hardware_devices",
  deeptech: "deeptech_ip_licensing",
  deeptech_quantum: "deeptech_ip_licensing",
  quantum: "deeptech_ip_licensing",
  spacetech: "deeptech_ip_licensing",
  space: "deeptech_ip_licensing",
  biotech: "biotech_regulated_pipeline",
  biotech_pharma: "biotech_regulated_pipeline",
  fintech: "transactional_fintech",
  wealthtech: "transactional_fintech",
  insurtech: "transactional_fintech",
  professional_services: "agency_consultancy",
  // free-text aliases
  subscription: "saas_subscription",
  software: "saas_subscription",
  software_saas: "saas_subscription",
  b2b_saas: "saas_subscription",
  platform: "marketplace_platform",
  two_sided_marketplace: "marketplace_platform",
  payments: "transactional_fintech",
  lending: "transactional_fintech",
  insurance: "transactional_fintech",
  app: "consumer_app",
  mobile_app: "consumer_app",
  consumer_app: "consumer_app",
  d2c: "ecommerce_d2c",
  dtc: "ecommerce_d2c",
  direct_to_consumer: "ecommerce_d2c",
  online_store: "ecommerce_d2c",
  devices: "hardware_devices",
  iot: "hardware_devices",
  robotics: "hardware_devices",
  ip_licensing: "deeptech_ip_licensing",
  licensing: "deeptech_ip_licensing",
  pharma: "biotech_regulated_pipeline",
  clinical: "biotech_regulated_pipeline",
  services: "services_enabled_tech",
  tech_enabled_services: "services_enabled_tech",
  managed_services: "services_enabled_tech",
  agency: "agency_consultancy",
  consultancy: "agency_consultancy",
  consulting: "agency_consultancy",
  other: "unclassified",
  default: "unclassified",
  unknown: "unclassified",
};

/**
 * Map a legacy sector key / benchmark bucket / free business-model string to
 * a canonical business model. Never throws; unknown → `unclassified`.
 */
export function crosswalkBusinessModel(raw: string | null | undefined): BusinessModel {
  if (typeof raw !== "string") return "unclassified";
  const trimmed = raw.trim();
  if (!trimmed) return "unclassified";
  const snake = snakeKey(trimmed);
  if (isBusinessModel(snake)) return snake;
  const legacy = LEGACY_TO_BUSINESS_MODEL[snake];
  if (legacy) return legacy;
  if (/marketplace|two_sided|multi_sided|take_rate|gmv/.test(snake)) return "marketplace_platform";
  if (/saas|subscription/.test(snake)) return "saas_subscription";
  if (/e_?commerce|d2c|dtc|online_store/.test(snake)) return "ecommerce_d2c";
  if (/hardware|device|sensor/.test(snake)) return "hardware_devices";
  if (/agency|consult/.test(snake)) return "agency_consultancy";
  if (/service/.test(snake)) return "services_enabled_tech";
  if (/fintech|payment|lending|insurance/.test(snake)) return "transactional_fintech";
  if (/biotech|pharma|clinical/.test(snake)) return "biotech_regulated_pipeline";
  if (/deep_?tech|licens|patent/.test(snake)) return "deeptech_ip_licensing";
  if (/consumer|b2c|app/.test(snake)) return "consumer_app";
  return "unclassified";
}

// ─── Tag crosswalk (intake industry_tags → tags, §B.5) ───────────────────────

/** Intake `industry_tags` values that are really tags (not industries). */
export const INTAKE_TAG_TO_TAG: Readonly<Record<string, SuggestableTag>> = {
  defence_dualuse: "defence_dualuse",
  climate: "climate_impact",
  cleantech_renewables: "climate_impact",
  social_enterprise: "impact_social_enterprise",
};

/**
 * `regulated` auto rule (§B.4 vi): business model ∈ {transactional_fintech,
 * biotech_regulated_pipeline} or industry ∈ {healthtech_medtech, defence_dualuse}.
 */
export function isRegulatedByRule(industry: Industry, businessModel: BusinessModel): boolean {
  return (
    businessModel === "transactional_fintech" ||
    businessModel === "biotech_regulated_pipeline" ||
    industry === "healthtech_medtech" ||
    industry === "defence_dualuse"
  );
}

// ─── Labels helpers ──────────────────────────────────────────────────────────

export type TaxonomyLocale = "en" | "vi";

export function industryLabel(industry: Industry, locale: TaxonomyLocale = "en"): string {
  return (INDUSTRY_LABELS[industry] ?? INDUSTRY_LABELS.unclassified)[locale];
}
export function businessModelLabel(model: BusinessModel, locale: TaxonomyLocale = "en"): string {
  return (BUSINESS_MODEL_LABELS[model] ?? BUSINESS_MODEL_LABELS.unclassified)[locale];
}
export function customerTypeLabel(ct: CustomerType, locale: TaxonomyLocale = "en"): string {
  return (CUSTOMER_TYPE_LABELS[ct] ?? CUSTOMER_TYPE_LABELS.unclassified)[locale];
}
export function geoScopeLabel(scope: GeoScope, locale: TaxonomyLocale = "en"): string {
  return GEO_SCOPE_LABELS[scope][locale];
}
export function tagLabel(tag: Tag, locale: TaxonomyLocale = "en"): string {
  return TAG_LABELS[tag][locale];
}
