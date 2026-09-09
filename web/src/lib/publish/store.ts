// Server-only data access for published company profiles.
//
// Read path goes through `v_published_analysis`, never the base tables. The
// view physically cannot emit `anon_key`, `user_id`, `input_text`,
// `input_url`, `input_filename` or `intake`, so a future `select *` on this
// path still cannot leak a founder's raw input or identity.
//
// Write path is owner-only and signed-in-only. Publishing is a durable public
// act; an anonymous cookie is not a strong enough claim on a company's name
// to hang one on.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { CompactSvi } from "@/lib/analyses/payload";
import {
  checkAnalysisDepth,
  isValidSlug,
  normalisePublishFields,
  pickFreeSlug,
  slugify,
  type PublishFields,
  type PublishFieldsInput,
} from "./eligibility";

export const PUBLISHED_TABLE = "published_analyses";
export const PUBLISHED_VIEW = "v_published_analysis";
export const ANALYSES_TABLE = "analyses";

/** Every column the public view exposes. Kept in one place, and it is all of them. */
export const PUBLIC_COLUMNS =
  "slug, company_name, one_liner, sector, website_url, first_published_at, updated_at, analysis_id, stage, stage_label, svi_total, valuation_mid_aud, svi, analysed_at";

export interface PublishedRow {
  slug: string;
  company_name: string;
  one_liner: string;
  sector: string;
  website_url: string | null;
  first_published_at: string;
  updated_at: string;
  analysis_id: string;
  stage: number | null;
  stage_label: string | null;
  svi_total: number | null;
  valuation_mid_aud: number | null;
  svi: CompactSvi | null;
  analysed_at: string;
}

function missingRelation(message: string | undefined): boolean {
  return /relation .*(published_analyses|v_published_analysis).* does not exist/i.test(
    message ?? "",
  );
}

// ── Public reads ─────────────────────────────────────────────────────────

/**
 * One live profile by slug. Returns null for "no such slug" AND for
 * "published once, since withdrawn" — the view requires both
 * `public_visible = true` and `unpublished_at is null`, so an unpublish takes
 * effect on the very next request with no cache to wait out.
 */
export async function getPublishedBySlug(
  slug: string,
): Promise<PublishedRow | null> {
  if (!isValidSlug(slug)) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(PUBLISHED_VIEW)
    .select(PUBLIC_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    if (!missingRelation(error.message)) {
      console.error("[publish:get] query failed —", error.message);
    }
    return null;
  }
  return (data as unknown as PublishedRow) ?? null;
}

export interface ListPublishedOpts {
  sector?: string | null;
  stage?: number | null;
  limit?: number;
}

/** Live profiles, strongest index first so the directory leads with substance. */
export async function listPublished(
  opts: ListPublishedOpts = {},
): Promise<PublishedRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  let query = supabase
    .from(PUBLISHED_VIEW)
    .select(PUBLIC_COLUMNS)
    .order("svi_total", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(opts.limit ?? 200, 500)));
  if (opts.sector) query = query.eq("sector", opts.sector);
  if (typeof opts.stage === "number") query = query.eq("stage", opts.stage);
  const { data, error } = await query;
  if (error) {
    if (!missingRelation(error.message)) {
      console.error("[publish:list] query failed —", error.message);
    }
    return [];
  }
  return (data ?? []) as unknown as PublishedRow[];
}

/**
 * Slugs for the sitemap. An unpublished profile drops out of this list the
 * moment the flag flips, which is what de-indexes it — the page 404ing is
 * only half the signal.
 */
export async function listPublishedForSitemap(): Promise<
  { slug: string; updatedAt: string }[]
> {
  const rows = await listPublished({ limit: 500 });
  return rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
}

// ── Owner-facing state ───────────────────────────────────────────────────

export interface PublishState {
  analysisId: string;
  published: boolean;
  slug: string | null;
  url: string | null;
  fields: PublishFields | null;
  /** Suggested company name for a first-time publish, never auto-applied. */
  suggestedSector: string | null;
  firstPublishedAt: string | null;
  updatedAt: string | null;
}

interface OwnerRow {
  id: string;
  user_id: string | null;
  public_visible: boolean;
  svi: CompactSvi | null;
  stage_label: string | null;
  created_at: string;
}

async function loadOwnedAnalysis(
  analysisId: string,
  userId: string,
): Promise<OwnerRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(ANALYSES_TABLE)
    .select("id, user_id, public_visible, svi, stage_label, created_at")
    .eq("id", analysisId)
    .maybeSingle();
  if (error) {
    console.error("[publish:owner] query failed —", error.message);
    return null;
  }
  const row = data as unknown as OwnerRow | null;
  // Owner-only, and only a signed-in owner: "not yours" and "no such id" are
  // deliberately indistinguishable from the outside.
  if (!row || !row.user_id || row.user_id !== userId) return null;
  return row;
}

interface StoredPublishRow {
  slug: string;
  company_name: string;
  one_liner: string;
  sector: string;
  website_url: string | null;
  first_published_at: string;
  updated_at: string;
  unpublished_at: string | null;
}

async function loadPublishRow(
  analysisId: string,
): Promise<StoredPublishRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(PUBLISHED_TABLE)
    .select(
      "slug, company_name, one_liner, sector, website_url, first_published_at, updated_at, unpublished_at",
    )
    .eq("analysis_id", analysisId)
    .maybeSingle();
  if (error) {
    if (!missingRelation(error.message)) {
      console.error("[publish:row] query failed —", error.message);
    }
    return null;
  }
  return (data as unknown as StoredPublishRow) ?? null;
}

/** What the publish panel renders on mount. Null when the caller is not the owner. */
export async function getPublishState(
  analysisId: string,
  userId: string,
): Promise<PublishState | null> {
  const owned = await loadOwnedAnalysis(analysisId, userId);
  if (!owned) return null;
  const row = await loadPublishRow(analysisId);
  const live = Boolean(owned.public_visible && row && !row.unpublished_at);
  return {
    analysisId,
    published: live,
    slug: row?.slug ?? null,
    url: live && row ? `https://blockid.au/listings/${row.slug}` : null,
    fields: row
      ? {
          companyName: row.company_name,
          oneLiner: row.one_liner,
          sector: row.sector,
          websiteUrl: row.website_url,
        }
      : null,
    suggestedSector: owned.svi?.sector ?? null,
    firstPublishedAt: row?.first_published_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

// ── Publish / unpublish ──────────────────────────────────────────────────

export type PublishOutcome =
  | { ok: true; slug: string; url: string }
  | { ok: false; status: 404 | 400 | 500; reasons: string[] };

async function takenSlugs(prefix: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(PUBLISHED_TABLE)
    .select("slug")
    .like("slug", `${prefix}%`)
    .limit(100);
  if (error) return [];
  return (data ?? []).map((r) => (r as { slug: string }).slug);
}

/**
 * Flip an analysis public.
 *
 * Order matters: the presentation row is written first and
 * `analyses.public_visible` last, so a half-completed publish leaves the
 * profile invisible rather than live-but-blank.
 */
export async function publishAnalysis(params: {
  analysisId: string;
  userId: string;
  input: PublishFieldsInput;
}): Promise<PublishOutcome> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, status: 500, reasons: ["Storage unavailable."] };

  const owned = await loadOwnedAnalysis(params.analysisId, params.userId);
  if (!owned) return { ok: false, status: 404, reasons: ["Not found"] };

  const depth = checkAnalysisDepth(owned.svi);
  if (!depth.ok) return { ok: false, status: 400, reasons: depth.reasons };

  const fields = normalisePublishFields(params.input);
  if (!fields.ok) return { ok: false, status: 400, reasons: fields.reasons };

  const existing = await loadPublishRow(params.analysisId);
  // A republish keeps the URL it already had. Minting a second one would
  // silently orphan whatever the founder already shared.
  let slug = existing?.slug ?? "";
  if (!slug) {
    const desired = slugify(fields.fields.companyName);
    const tail = params.analysisId.slice(0, 6);
    slug = pickFreeSlug(desired, await takenSlugs(desired || "startup"), tail);
  }
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      status: 400,
      reasons: ["That company name cannot be turned into a web address. Try a Latin-alphabet name."],
    };
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await supabase.from(PUBLISHED_TABLE).upsert(
    {
      analysis_id: params.analysisId,
      user_id: params.userId,
      slug,
      company_name: fields.fields.companyName,
      one_liner: fields.fields.oneLiner,
      sector: fields.fields.sector,
      website_url: fields.fields.websiteUrl,
      updated_at: now,
      unpublished_at: null,
    },
    { onConflict: "analysis_id" },
  );
  if (upsertError) {
    console.error("[publish:upsert] failed —", upsertError.message);
    return { ok: false, status: 500, reasons: ["Could not save the profile. Try again."] };
  }

  const { error: flagError } = await supabase
    .from(ANALYSES_TABLE)
    .update({ public_visible: true })
    .eq("id", params.analysisId)
    .eq("user_id", params.userId);
  if (flagError) {
    console.error("[publish:flag] failed —", flagError.message);
    return { ok: false, status: 500, reasons: ["Could not publish the profile. Try again."] };
  }

  return { ok: true, slug, url: `https://blockid.au/listings/${slug}` };
}

/**
 * Withdraw a published profile.
 *
 * `public_visible` goes false FIRST — that is the switch every public read
 * consults, so the page stops resolving and the sitemap stops listing it
 * before anything else happens. The presentation row is kept (stamped
 * `unpublished_at`) so a later republish returns the same URL.
 */
export async function unpublishAnalysis(params: {
  analysisId: string;
  userId: string;
}): Promise<{ ok: boolean; status: 404 | 500 | 200 }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, status: 500 };

  const owned = await loadOwnedAnalysis(params.analysisId, params.userId);
  if (!owned) return { ok: false, status: 404 };

  const { error: flagError } = await supabase
    .from(ANALYSES_TABLE)
    .update({ public_visible: false })
    .eq("id", params.analysisId)
    .eq("user_id", params.userId);
  if (flagError) {
    console.error("[publish:unflag] failed —", flagError.message);
    return { ok: false, status: 500 };
  }

  const { error: stampError } = await supabase
    .from(PUBLISHED_TABLE)
    .update({ unpublished_at: new Date().toISOString() })
    .eq("analysis_id", params.analysisId);
  if (stampError && !missingRelation(stampError.message)) {
    // The profile is already invisible at this point; a failed stamp is a
    // bookkeeping problem, not a privacy one.
    console.error("[publish:stamp] failed —", stampError.message);
  }

  return { ok: true, status: 200 };
}
