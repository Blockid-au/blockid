// startup_taxonomy store (server-only) — G13-W1-T1.
//
// Two operations for this sprint:
//   getTaxonomy(projectId)                       → the row or null
//   upsertSuggestedTaxonomy(projectId, suggestion) → the pipeline's silent fill
//
// DQ rules enforced here (spec §B.9):
//   DQ-1  a suggestion below AUTO_FILL_MIN_CONFIDENCE never lands in a live
//         column (suggest.ts already reports it as unclassified / null).
//   DQ-2  every auto-filled field records sources.<field> = 'auto'.
//   DQ-4  protected tags on the row are never touched by the pipeline.
//   DQ-5  a field is *locked* once a founder / evaluator owns it — either
//         `sources.<field>` is founder|evaluator, or `confirmed_at` is set and
//         the field has no explicit 'auto' source. Locked fields are never
//         overwritten; `suggested` is always refreshed and the caller gets the
//         list of fields where the suggestion differs (the E1.4 hint).
//
// All writes go through the service role (house pattern); RLS is defence in
// depth. Nothing here throws on a DB error — callers are request paths that
// must never fail because classification did.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import {
  INDUSTRY_ANZSIC,
  TAXONOMY_VERSION,
  isProtectedTag,
  isTag,
  type StartupTaxonomyRow,
  type Tag,
  type TaxonomyField,
  type TaxonomySource,
  type TaxonomySources,
} from "./startup-taxonomy";
import type { TaxonomySuggestion } from "./suggest";

export const STARTUP_TAXONOMY_COLUMNS =
  "project_id, taxonomy_version, industry, sub_industry, industry_secondary, business_model, customer_types, stage_key, hq_state, hq_country, geo_scope, tags, anzsic_division, anzsic_class, sources, confidence, suggested, confirmed_by, confirmed_at, created_at, updated_at";

type Row = Record<string, unknown>;

export type UpsertTaxonomyMode = "inserted" | "updated" | "suggested_only" | "unchanged" | "skipped";

export interface UpsertTaxonomyResult {
  ok: boolean;
  mode: UpsertTaxonomyMode;
  /** Fields that were written to live columns this call. */
  applied: TaxonomyField[];
  /** Locked (confirmed) fields whose confirmed value differs from the suggestion — the "Suggestion differs" hint. */
  differs: TaxonomyField[];
  error?: string;
}

/** The live-column fields the pipeline may fill. */
const SUGGESTED_FIELDS: readonly Exclude<TaxonomyField, "tags">[] = [
  "industry",
  "sub_industry",
  "industry_secondary",
  "business_model",
  "customer_types",
  "stage_key",
  "hq_state",
  "geo_scope",
];

const HUMAN_SOURCES: readonly TaxonomySource[] = ["founder", "evaluator"];

function asRow(data: unknown): StartupTaxonomyRow | null {
  if (!data || typeof data !== "object") return null;
  const r = data as Row;
  return {
    project_id: String(r.project_id ?? ""),
    taxonomy_version: typeof r.taxonomy_version === "string" ? r.taxonomy_version : TAXONOMY_VERSION,
    industry: (r.industry as StartupTaxonomyRow["industry"]) ?? "unclassified",
    sub_industry: typeof r.sub_industry === "string" ? r.sub_industry : null,
    industry_secondary: (r.industry_secondary as StartupTaxonomyRow["industry_secondary"]) ?? null,
    business_model: (r.business_model as StartupTaxonomyRow["business_model"]) ?? "unclassified",
    customer_types: Array.isArray(r.customer_types) ? (r.customer_types as StartupTaxonomyRow["customer_types"]) : [],
    stage_key: (r.stage_key as StartupTaxonomyRow["stage_key"]) ?? "idea",
    hq_state: (r.hq_state as StartupTaxonomyRow["hq_state"]) ?? null,
    hq_country: typeof r.hq_country === "string" ? r.hq_country : "AU",
    geo_scope: (r.geo_scope as StartupTaxonomyRow["geo_scope"]) ?? null,
    tags: Array.isArray(r.tags) ? (r.tags as Tag[]).filter(isTag) : [],
    anzsic_division: typeof r.anzsic_division === "string" ? r.anzsic_division : null,
    anzsic_class: typeof r.anzsic_class === "string" ? r.anzsic_class : null,
    sources: r.sources && typeof r.sources === "object" ? (r.sources as TaxonomySources) : {},
    confidence: r.confidence && typeof r.confidence === "object" ? (r.confidence as StartupTaxonomyRow["confidence"]) : {},
    suggested: r.suggested && typeof r.suggested === "object" ? (r.suggested as Row) : null,
    confirmed_by: typeof r.confirmed_by === "string" ? r.confirmed_by : null,
    confirmed_at: typeof r.confirmed_at === "string" ? r.confirmed_at : null,
    created_at: typeof r.created_at === "string" ? r.created_at : "",
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
  };
}

export async function getTaxonomy(projectId: string): Promise<StartupTaxonomyRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !projectId) return null;
  const { data, error } = await supabase
    .from("startup_taxonomy")
    .select(STARTUP_TAXONOMY_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    console.error("[blockid:taxonomy] getTaxonomy failed", error);
    return null;
  }
  return asRow(data);
}

/** DQ-5: is this live field owned by a human (and therefore locked against the pipeline)? */
export function isFieldLocked(row: Pick<StartupTaxonomyRow, "sources" | "confirmed_at">, field: Exclude<TaxonomyField, "tags">): boolean {
  const src = row.sources?.[field];
  if (src && HUMAN_SOURCES.includes(src)) return true;
  if (row.confirmed_at && src !== "auto") return true;
  return false;
}

/** DQ-5 for tags: a tag is locked when a human set it; protected tags are always locked (DQ-4). */
export function isTagLocked(row: Pick<StartupTaxonomyRow, "sources" | "confirmed_at">, tag: Tag): boolean {
  if (isProtectedTag(tag)) return true;
  const src = row.sources?.tags?.[tag];
  if (src && HUMAN_SOURCES.includes(src)) return true;
  if (row.confirmed_at && src !== "auto") return true;
  return false;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return (a ?? null) === (b ?? null);
}

function suggestionPayload(s: TaxonomySuggestion): Row {
  // Everything the classifier returned, stored verbatim (jsonb) for the E1.4 "AI suggested" hint.
  return { ...s };
}

/**
 * Silent fill from the pipeline. Never overwrites a locked field; always
 * refreshes `suggested`; inserts the row when missing. Safe to call after
 * every analysis — a no-op update is skipped.
 */
export async function upsertSuggestedTaxonomy(projectId: string, suggestion: TaxonomySuggestion): Promise<UpsertTaxonomyResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, mode: "skipped", applied: [], differs: [], error: "Service unavailable" };
  if (!projectId) return { ok: false, mode: "skipped", applied: [], differs: [], error: "projectId required" };

  // Defensive DQ-4: the type already excludes protected tags; drop any that slipped through at runtime.
  const suggestedTags = suggestion.tags.filter((t) => isTag(t) && !isProtectedTag(t));

  const { data: existingRaw, error: readError } = await supabase
    .from("startup_taxonomy")
    .select(STARTUP_TAXONOMY_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle();
  if (readError) {
    console.error("[blockid:taxonomy] upsertSuggestedTaxonomy read failed", readError);
    return { ok: false, mode: "skipped", applied: [], differs: [], error: readError.message ?? "read failed" };
  }
  const existing = asRow(existingRaw);

  // ── insert: nothing to protect yet ──
  if (!existing) {
    const sources: TaxonomySources = {};
    const applied: TaxonomyField[] = [];
    const insert: Row = {
      project_id: projectId,
      taxonomy_version: suggestion.taxonomy_version || TAXONOMY_VERSION,
      hq_country: "AU",
      suggested: suggestionPayload(suggestion),
      confidence: suggestion.confidence,
    };
    for (const field of SUGGESTED_FIELDS) {
      const value = suggestion[field];
      insert[field] = value;
      if (suggestion.sources[field] === "auto") {
        sources[field] = "auto";
        applied.push(field);
      }
    }
    insert.tags = suggestedTags;
    if (suggestedTags.length) {
      sources.tags = Object.fromEntries(suggestedTags.map((t) => [t, "auto" as const]));
      applied.push("tags");
    }
    insert.sources = sources;
    insert.anzsic_division = INDUSTRY_ANZSIC[suggestion.industry]?.division ?? null;

    const { error } = await supabase.from("startup_taxonomy").insert(insert);
    if (error) {
      console.error("[blockid:taxonomy] upsertSuggestedTaxonomy insert failed", error);
      return { ok: false, mode: "skipped", applied: [], differs: [], error: error.message ?? "insert failed" };
    }
    return { ok: true, mode: "inserted", applied, differs: [] };
  }

  // ── update: respect locks ──
  // W1 review P2: a thinner re-run (no rawText / no state) must not erase a
  // confident earlier value — only merge confidences that carry evidence.
  const positiveConfidence = Object.fromEntries(
    Object.entries(suggestion.confidence ?? {}).filter(([, v]) => typeof v === "number" && v > 0),
  ) as typeof suggestion.confidence;
  const patch: Row = {
    suggested: suggestionPayload(suggestion),
    confidence: { ...existing.confidence, ...positiveConfidence },
  };
  const sources: TaxonomySources = { ...existing.sources, tags: { ...(existing.sources.tags ?? {}) } };
  const applied: TaxonomyField[] = [];
  const differs: TaxonomyField[] = [];

  for (const field of SUGGESTED_FIELDS) {
    const next = suggestion[field];
    const cur = existing[field];
    if (isFieldLocked(existing, field)) {
      if (!sameValue(cur, next) && suggestion.sources[field] === "auto") differs.push(field);
      continue;
    }
    if (sameValue(cur, next)) continue;
    // "No opinion" (no source — below the confidence floor or no input for
    // this axis) is not "unknown": keep the stored auto value.
    if (suggestion.sources[field] !== "auto") continue;
    patch[field] = next;
    sources[field] = "auto";
    applied.push(field);
  }

  // Tags: keep every locked tag exactly as is; replace the auto set.
  const lockedTags = existing.tags.filter((t) => isTagLocked(existing, t));
  const nextTags: Tag[] = [...lockedTags];
  const tagSources: NonNullable<TaxonomySources["tags"]> = {};
  for (const t of lockedTags) {
    const src = existing.sources.tags?.[t];
    if (src) tagSources[t] = src;
    else if (existing.confirmed_at) tagSources[t] = "founder";
  }
  for (const t of suggestedTags) {
    if (nextTags.includes(t)) {
      if (!lockedTags.includes(t)) tagSources[t] = "auto";
      continue;
    }
    if (isTagLocked(existing, t)) {
      differs.push("tags");
      continue;
    }
    nextTags.push(t);
    tagSources[t] = "auto";
  }
  const sortedNext = [...nextTags].sort();
  const sortedCur = [...existing.tags].sort();
  if (!sameValue(sortedCur, sortedNext)) {
    patch.tags = nextTags;
    applied.push("tags");
  }
  sources.tags = tagSources;
  if (Object.keys(tagSources).length === 0) delete sources.tags;
  // Protected tags on the existing row are never touched (DQ-4): isTagLocked() keeps them in lockedTags.

  if (applied.length) {
    patch.sources = sources;
    if (patch.industry !== undefined) patch.anzsic_division = INDUSTRY_ANZSIC[suggestion.industry]?.division ?? null;
  }
  if (!existing.taxonomy_version) patch.taxonomy_version = TAXONOMY_VERSION;

  const { error } = await supabase.from("startup_taxonomy").update(patch).eq("project_id", projectId);
  if (error) {
    console.error("[blockid:taxonomy] upsertSuggestedTaxonomy update failed", error);
    return { ok: false, mode: "skipped", applied: [], differs, error: error.message ?? "update failed" };
  }
  const dedupDiffers = [...new Set(differs)];
  if (applied.length) return { ok: true, mode: "updated", applied, differs: dedupDiffers };
  return { ok: true, mode: dedupDiffers.length || existing.confirmed_at ? "suggested_only" : "unchanged", applied: [], differs: dedupDiffers };
}
