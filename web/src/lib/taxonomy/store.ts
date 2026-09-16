// startup_taxonomy store (server-only) — G13-W1-T1 (+ E1.4 in G13-W4-D2).
//
// Operations:
//   getTaxonomy(projectId)                       → the row or null
//   upsertSuggestedTaxonomy(projectId, suggestion) → the pipeline's silent fill
//   confirmTaxonomy(projectId, input, actor)     → the human write (founder
//        confirmation card / project settings form, evaluator intake):
//        live columns + sources.<field> = founder|evaluator, confirmed_at /
//        confirmed_by on confirm, "Not sure" → unclassified (DQ-1), protected
//        tags accepted from a founder only (DQ-4), founder-owned fields
//        never overwritten by an evaluator (founder supersedes, §B.6 step 3).
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
import { appendAudit } from "@/lib/audit";
import {
  INDUSTRY_ANZSIC,
  TAXONOMY_VERSION,
  isBusinessModel,
  isCustomerType,
  isGeoScope,
  isHqState,
  isIndustry,
  isProtectedTag,
  isStageKey,
  isTag,
  type BusinessModel,
  type CustomerType,
  type GeoScope,
  type HqState,
  type Industry,
  type StageKey,
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

// ─── E1.4 — the human write (founder confirmation / evaluator intake) ────────

/** Axes a human may set from the card / form. `not_sure` resets an axis to its honest unclassified value (DQ-1). */
export const CONFIRMABLE_FIELDS = ["industry", "business_model", "stage_key", "customer_types", "geo_scope", "hq_state", "tags"] as const;
export type ConfirmableField = (typeof CONFIRMABLE_FIELDS)[number];

export interface ConfirmTaxonomyInput {
  industry?: Industry;
  business_model?: BusinessModel;
  stage_key?: StageKey;
  customer_types?: CustomerType[];
  geo_scope?: GeoScope | null;
  hq_state?: HqState | null;
  tags?: Tag[];
  /** Axes the human explicitly marked "Not sure" → unclassified / null. */
  not_sure?: ConfirmableField[];
  /** true = "Confirm" (stamps confirmed_at / confirmed_by); false = "Edit" only. */
  confirm: boolean;
}

export interface ConfirmTaxonomyActor {
  userId: string;
  source: Extract<TaxonomySource, "founder" | "evaluator">;
}

export type ConfirmTaxonomyResult =
  | { ok: true; row: StartupTaxonomyRow; changed: TaxonomyField[]; droppedProtectedTags: Tag[]; lockedByFounder: TaxonomyField[]; unclassifiedCount: number }
  | { ok: false; error: "unavailable" | "invalid" | "db_error"; message: string };

const UNCLASSIFIED_VALUE: Record<ConfirmableField, unknown> = {
  industry: "unclassified",
  business_model: "unclassified",
  stage_key: undefined, // no honest "unknown" stage — left as is
  customer_types: ["unclassified"],
  geo_scope: null,
  hq_state: null,
  tags: [],
};

/** Zero-trust re-validation (the route already ran Zod; the store is callable from scripts too). */
function validateConfirmInput(input: ConfirmTaxonomyInput): string | null {
  if (input.industry !== undefined && !isIndustry(input.industry)) return "industry";
  if (input.business_model !== undefined && !isBusinessModel(input.business_model)) return "business_model";
  if (input.stage_key !== undefined && !isStageKey(input.stage_key)) return "stage_key";
  if (input.customer_types !== undefined && !(Array.isArray(input.customer_types) && input.customer_types.every(isCustomerType))) return "customer_types";
  if (input.geo_scope != null && !isGeoScope(input.geo_scope)) return "geo_scope";
  if (input.hq_state != null && !isHqState(input.hq_state)) return "hq_state";
  if (input.tags !== undefined && !(Array.isArray(input.tags) && input.tags.every(isTag))) return "tags";
  if (input.not_sure !== undefined && !input.not_sure.every((f) => (CONFIRMABLE_FIELDS as readonly string[]).includes(f))) return "not_sure";
  return null;
}

export function countUnclassified(row: Pick<StartupTaxonomyRow, "industry" | "business_model" | "customer_types">): number {
  let n = 0;
  if (row.industry === "unclassified") n += 1;
  if (row.business_model === "unclassified") n += 1;
  if (!row.customer_types.length || row.customer_types.every((c) => c === "unclassified")) n += 1;
  return n;
}

const HUMAN_SCALAR_FIELDS = ["industry", "business_model", "stage_key", "customer_types", "geo_scope", "hq_state"] as const;

/**
 * Human write. Evaluator source never overwrites a founder-sourced field
 * (founder confirmation supersedes); founder source may overwrite anything.
 * Inserts the row when the pipeline has not created it yet.
 */
export async function confirmTaxonomy(projectId: string, input: ConfirmTaxonomyInput, actor: ConfirmTaxonomyActor): Promise<ConfirmTaxonomyResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  if (!projectId) return { ok: false, error: "invalid", message: "projectId required" };
  const bad = validateConfirmInput(input);
  if (bad) return { ok: false, error: "invalid", message: `Invalid value for ${bad}` };

  const { data: existingRaw, error: readError } = await supabase.from("startup_taxonomy").select(STARTUP_TAXONOMY_COLUMNS).eq("project_id", projectId).maybeSingle();
  if (readError) {
    console.error("[blockid:taxonomy] confirmTaxonomy read failed", readError);
    return { ok: false, error: "db_error", message: readError.message ?? "read failed" };
  }
  const existing = asRow(existingRaw);
  const base: StartupTaxonomyRow = existing ?? {
    project_id: projectId,
    taxonomy_version: TAXONOMY_VERSION,
    industry: "unclassified",
    sub_industry: null,
    industry_secondary: null,
    business_model: "unclassified",
    customer_types: [],
    stage_key: "idea",
    hq_state: null,
    hq_country: "AU",
    geo_scope: null,
    tags: [],
    anzsic_division: null,
    anzsic_class: null,
    sources: {},
    confidence: {},
    suggested: null,
    confirmed_by: null,
    confirmed_at: null,
    created_at: "",
    updated_at: "",
  };

  const patch: Row = {};
  const sources: TaxonomySources = { ...base.sources, tags: { ...(base.sources.tags ?? {}) } };
  const changed: TaxonomyField[] = [];
  const lockedByFounder: TaxonomyField[] = [];
  const notSure = new Set(input.not_sure ?? []);

  const scalar = (field: (typeof HUMAN_SCALAR_FIELDS)[number], provided: unknown) => {
    const wanted = notSure.has(field) ? UNCLASSIFIED_VALUE[field] : provided;
    if (wanted === undefined) return;
    if (actor.source === "evaluator" && base.sources[field] === "founder") {
      lockedByFounder.push(field);
      return;
    }
    if (!sameValue(base[field], wanted)) {
      patch[field] = wanted;
      changed.push(field);
    }
    sources[field] = actor.source;
  };
  scalar("industry", input.industry);
  scalar("business_model", input.business_model);
  scalar("stage_key", input.stage_key);
  scalar("customer_types", input.customer_types);
  scalar("geo_scope", input.geo_scope);
  scalar("hq_state", input.hq_state);

  // Tags: a founder replaces the whole set (protected included — DQ-4 says
  // founder-declared ONLY, so the founder is exactly who may set them). An
  // evaluator replaces the non-protected set and never touches protected or
  // founder-set tags.
  const droppedProtectedTags: Tag[] = [];
  const wantedTags = notSure.has("tags") ? [] : input.tags;
  if (wantedTags !== undefined) {
    const next = new Set<Tag>();
    const tagSources: NonNullable<TaxonomySources["tags"]> = {};
    if (actor.source === "founder") {
      for (const t of wantedTags) {
        next.add(t);
        tagSources[t] = "founder";
      }
    } else {
      for (const t of base.tags) {
        const src = base.sources.tags?.[t];
        if (isProtectedTag(t) || src === "founder") {
          next.add(t);
          tagSources[t] = src ?? "founder";
        }
      }
      for (const t of wantedTags) {
        if (isProtectedTag(t)) {
          if (!next.has(t)) droppedProtectedTags.push(t);
          continue;
        }
        if (!next.has(t)) {
          next.add(t);
          tagSources[t] = "evaluator";
        }
      }
    }
    const nextTags = [...next].sort();
    if (!sameValue([...base.tags].sort(), nextTags)) {
      patch.tags = nextTags;
      changed.push("tags");
    }
    sources.tags = tagSources;
  }
  if (sources.tags && Object.keys(sources.tags).length === 0) delete sources.tags;

  const now = new Date().toISOString();
  if (input.confirm) {
    // §B.6 / T1: on confirm every live axis becomes human-sourced (the human
    // vouched for the values as shown), not only the edited ones.
    for (const field of HUMAN_SCALAR_FIELDS) {
      if (actor.source === "evaluator" && base.sources[field] === "founder") continue;
      sources[field] = actor.source;
    }
    // An evaluator cannot re-stamp a founder's confirmation (founder supersedes).
    const founderConfirmed = base.confirmed_at && Object.values(base.sources).includes("founder");
    if (!(actor.source === "evaluator" && founderConfirmed)) {
      patch.confirmed_at = now;
      patch.confirmed_by = actor.userId;
    }
  }
  patch.sources = sources;
  if (patch.industry !== undefined) patch.anzsic_division = INDUSTRY_ANZSIC[patch.industry as Industry]?.division ?? null;
  if (!base.taxonomy_version) patch.taxonomy_version = TAXONOMY_VERSION;

  let saved: unknown;
  if (existing) {
    const { data, error } = await supabase.from("startup_taxonomy").update(patch).eq("project_id", projectId).select(STARTUP_TAXONOMY_COLUMNS).maybeSingle();
    if (error) {
      console.error("[blockid:taxonomy] confirmTaxonomy update failed", error);
      return { ok: false, error: "db_error", message: error.message ?? "update failed" };
    }
    saved = data;
  } else {
    const insert: Row = {
      project_id: projectId,
      taxonomy_version: TAXONOMY_VERSION,
      hq_country: "AU",
      industry: base.industry,
      business_model: base.business_model,
      customer_types: base.customer_types,
      stage_key: base.stage_key,
      geo_scope: base.geo_scope,
      hq_state: base.hq_state,
      tags: base.tags,
      confidence: {},
      ...patch,
    };
    const { data, error } = await supabase.from("startup_taxonomy").insert(insert).select(STARTUP_TAXONOMY_COLUMNS).maybeSingle();
    if (error) {
      console.error("[blockid:taxonomy] confirmTaxonomy insert failed", error);
      return { ok: false, error: "db_error", message: error.message ?? "insert failed" };
    }
    saved = data;
  }
  // A RETURNING-less client may hand back nothing — rebuild from what we wrote.
  const row = asRow(saved) ?? asRow({ ...base, ...patch, created_at: base.created_at || now, updated_at: now })!;
  const unclassifiedCount = countUnclassified(row);

  void appendAudit({
    user_id: actor.userId,
    actor: "user",
    action: input.confirm ? "taxonomy.confirmed" : "taxonomy.edited",
    resource_type: "startup_taxonomy",
    resource_id: projectId,
    detail: { source: actor.source, changed, not_sure: [...notSure], unclassified_count: unclassifiedCount, dropped_protected_tags: droppedProtectedTags, locked_by_founder: lockedByFounder },
  }).catch((err: unknown) => {
    if (process.env.NODE_ENV !== "test") console.warn("[blockid:taxonomy] audit write skipped:", err instanceof Error ? err.message : err);
  });

  return { ok: true, row, changed, droppedProtectedTags, lockedByFounder, unclassifiedCount };
}
