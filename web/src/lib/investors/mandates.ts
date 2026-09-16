// Investor mandates — types, Zod, personal-org bootstrap, list / upsert and
// the one-release `app_users.investor_prefs` mirror (G13-W3-T2, BA spec
// docs/plans/investor-clarity-2026-09-15/10-ba-investor-dossier-taxonomy.md
// §B.7, §B.10 T3, Appendix 1; migration 0393).
//
// Shape: the 7 form sections map 1:1 onto `investor_mandates` columns:
//   1 identity      label (firm name), kind (on the org), thesis, discoverable
//   2 appetite      sectors_include / sectors_exclude / business_models /
//                   customer_types  — taxonomy vocab (D3)
//   3 stage&cheque  stages (CANONICAL_STAGES), cheque_min/max_aud,
//                   lead_or_follow, ownership_target_pct, followon_reserve_pct
//   4 geography     geographies (AU states + national / anz / apac / global)
//   5 floors        revenue_min_aud, growth_min_pct, min_svi
//   6 tags & ESG    tags_include / tags_exclude / esg_constraints / risk_tolerance
//   7 weights       FIT_WEIGHTS_V2 override (Program only; sum 100)
// Everything except section 1 is optional — unfilled = "any".
//
// Org bootstrap: the first save creates the user's PERSONAL
// investor_organisations row (is_personal, owner_user_id) + one member seat;
// every mandate carries BOTH owner_user_id and org_id. Shared orgs / seat
// invites arrive in S-D3 (E4.5) — `listMandates` already unions the orgs the
// user is a seat of, so nothing here changes when they do.
//
// Plan limits (§B.7): Scout one mandate, Firm a few, Program many — read
// from `plans.usage_limits.mandates` when the row carries it, else the
// tier fallback below (mirrors LEGACY_FEATURE_FALLBACK's spirit: a plans-row
// read failure never locks a paying customer out).
//
// Mirror (§B.7 / R4): `app_users.investor_prefs` is written ONLY from
// `upsertMandate` for one release (deal-flow legacy path + the
// `investor_prefs`-based candidates in lib/funding/investor-match.ts still
// read it); `legacyPrefsToDraft` is the read-through the other way — the
// form is prefilled from the old prefs when the user has no mandate yet.
//
// Every reader is 42P01-guarded: before 0393 is applied `listMandates`
// returns `{ migrated: false }` and the page renders "not migrated".

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { getPlanCached } from "@/lib/plans-db";
import { LEGACY_PLAN_MAP } from "@/lib/plans";
import { planIdToTier, type PlanTier } from "@/lib/segments";
import { STAGE_BAND_TO_STAGE_KEYS, crosswalkIndustry, type StageKey } from "@/lib/taxonomy/startup-taxonomy";
import {
  THESIS_MAX_LEN,
  getInvestorPreferences,
  setInvestorDiscoverable,
  setInvestorPreferences,
  type InvestorPreferences,
  type StageBand,
} from "@/lib/investor-portal";
import {
  MANDATE_KINDS,
  MANDATE_LABEL_MAX_LEN,
  MANDATE_THESIS_MAX_LEN,
  type InvestorMandate,
  type InvestorOrganisation,
  type MandateInput,
  type MandateInputRaw,
  type MandateKind,
} from "./mandates-shared";

// The pure half (vocabulary, Zod, row types) lives in ./mandates-shared.ts so
// the client form can import it; everything is re-exported here so server
// callers keep one import path.
export * from "./mandates-shared";

export const MANDATE_COLUMNS =
  "id, org_id, owner_user_id, label, thesis, is_default, discoverable, is_active, sectors_include, sectors_exclude, business_models, customer_types, stages, cheque_min_aud, cheque_max_aud, lead_or_follow, ownership_target_pct, followon_reserve_pct, geographies, revenue_min_aud, growth_min_pct, min_svi, tags_include, tags_exclude, esg_constraints, risk_tolerance, weights, created_at, updated_at";

type Row = Record<string, unknown>;

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalise a DB row (numerics arrive as strings via PostgREST). */
export function mandateFromRow(r: Row): InvestorMandate {
  const lof = r.lead_or_follow;
  const rt = r.risk_tolerance;
  return {
    id: String(r.id),
    org_id: r.org_id ? String(r.org_id) : null,
    owner_user_id: r.owner_user_id ? String(r.owner_user_id) : null,
    label: typeof r.label === "string" ? r.label : "",
    thesis: typeof r.thesis === "string" && r.thesis ? r.thesis : null,
    is_default: r.is_default !== false,
    discoverable: r.discoverable === true,
    is_active: r.is_active !== false,
    sectors_include: strArr(r.sectors_include),
    sectors_exclude: strArr(r.sectors_exclude),
    business_models: strArr(r.business_models),
    customer_types: strArr(r.customer_types),
    stages: strArr(r.stages),
    cheque_min_aud: numOrNull(r.cheque_min_aud),
    cheque_max_aud: numOrNull(r.cheque_max_aud),
    lead_or_follow: lof === "lead" || lof === "follow" || lof === "both" ? lof : null,
    ownership_target_pct: numOrNull(r.ownership_target_pct),
    followon_reserve_pct: numOrNull(r.followon_reserve_pct),
    geographies: strArr(r.geographies),
    revenue_min_aud: numOrNull(r.revenue_min_aud),
    growth_min_pct: numOrNull(r.growth_min_pct),
    min_svi: numOrNull(r.min_svi),
    tags_include: strArr(r.tags_include),
    tags_exclude: strArr(r.tags_exclude),
    esg_constraints: strArr(r.esg_constraints),
    risk_tolerance: rt === "low" || rt === "medium" || rt === "high" ? rt : null,
    weights: r.weights && typeof r.weights === "object" && !Array.isArray(r.weights) ? (r.weights as Record<string, number>) : {},
    created_at: typeof r.created_at === "string" ? r.created_at : "",
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
  };
}

/** True for "relation does not exist" (0393 not applied) — every reader degrades on it. */
export function isMissingRelation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table|schema cache/i.test(String(e.message ?? ""));
}

// ─── Plan limits ─────────────────────────────────────────────────────────────

/** Mandates per user by evaluator tier (§B.7: Scout one, Program many). */
export const MANDATE_LIMIT_BY_TIER: Readonly<Partial<Record<PlanTier, number>>> = Object.freeze({
  angel: 1, // Scout
  advisor: 3, // Firm
  vc_small: 10, // Program
  vc_ent: 25,
  accel_starter: 1,
  accel_growth: 3,
  accel_ent: 10,
  enterprise: 3,
});

/** Read `plans.usage_limits.mandates`, else the tier fallback, else 1. Never throws. */
export async function mandateLimitFor(planId: string | null | undefined): Promise<number> {
  const resolved = LEGACY_PLAN_MAP[planId ?? ""]?.id ?? planId ?? "founder_free";
  try {
    const plan = await getPlanCached(resolved);
    const limits = (plan?.usage_limits ?? {}) as Record<string, unknown>;
    const n = limits.mandates;
    if (typeof n === "number" && Number.isFinite(n)) return n >= 9999 ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.floor(n));
  } catch {
    /* plans table unreadable → tier fallback */
  }
  return MANDATE_LIMIT_BY_TIER[planIdToTier(planId)] ?? 1;
}

/** Section 7 (weights) is Program and above. */
export function canEditWeights(planId: string | null | undefined): boolean {
  const t = planIdToTier(planId);
  return t === "vc_small" || t === "vc_ent" || t === "accel_ent" || t === "enterprise";
}

// ─── Personal org bootstrap ──────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function orgFromRow(r: Row): InvestorOrganisation {
  return {
    id: String(r.id),
    slug: String(r.slug ?? ""),
    name: String(r.name ?? ""),
    kind: (MANDATE_KINDS as readonly string[]).includes(String(r.kind)) ? (r.kind as MandateKind) : "angel",
    owner_user_id: r.owner_user_id ? String(r.owner_user_id) : null,
    is_personal: r.is_personal === true,
  };
}

/**
 * The user's personal investor organisation, created on first call
 * (`is_personal`, `owner_user_id`, one member seat). Returns null when the
 * table is missing (0393 pending) or Supabase is unavailable.
 */
export async function getOrCreatePersonalOrg(
  userId: string,
  seed: { name?: string | null; kind?: MandateKind | null } = {},
): Promise<InvestorOrganisation | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return null;
  try {
    const { data: existing, error } = await supabase
      .from("investor_organisations")
      .select("id, slug, name, kind, owner_user_id, is_personal")
      .eq("owner_user_id", userId)
      .eq("is_personal", true)
      .maybeSingle();
    if (error) {
      if (!isMissingRelation(error)) console.error("[blockid:mandates] personal org read failed", error);
      return null;
    }
    if (existing) {
      const org = orgFromRow(existing as Row);
      // Keep the org's display fields in step with section 1.
      const patch: Row = {};
      if (seed.name && seed.name.trim() && seed.name.trim() !== org.name) patch.name = seed.name.trim();
      if (seed.kind && seed.kind !== org.kind) patch.kind = seed.kind;
      if (Object.keys(patch).length) {
        await supabase.from("investor_organisations").update(patch).eq("id", org.id);
        Object.assign(org, patch);
      }
      return org;
    }
    const name = (seed.name ?? "").trim() || "Personal";
    const slug = `${slugify(name) || "personal"}-${userId.replace(/-/g, "").slice(0, 8)}`;
    const { data: created, error: insErr } = await supabase
      .from("investor_organisations")
      .insert({ slug, name, kind: seed.kind ?? "angel", owner_user_id: userId, is_personal: true, home_country: "AU" })
      .select("id, slug, name, kind, owner_user_id, is_personal")
      .single();
    if (insErr || !created) {
      if (!isMissingRelation(insErr)) console.error("[blockid:mandates] personal org insert failed", insErr);
      return null;
    }
    const org = orgFromRow(created as Row);
    const { error: memErr } = await supabase
      .from("investor_organisation_members")
      .upsert({ org_id: org.id, user_id: userId, role: "investment_partner" }, { onConflict: "org_id,user_id" });
    if (memErr && !isMissingRelation(memErr)) console.warn("[blockid:mandates] seat insert failed", memErr.message ?? memErr);
    return org;
  } catch (err) {
    console.error("[blockid:mandates] getOrCreatePersonalOrg threw", err);
    return null;
  }
}

// ─── List ────────────────────────────────────────────────────────────────────

export interface MandateList {
  /** false = 0393 not applied (or Supabase unavailable) — render "not migrated". */
  migrated: boolean;
  mandates: InvestorMandate[];
  /** The default (or first) mandate, for deal-flow and the form. */
  primary: InvestorMandate | null;
}

/** Org ids the user is a seat of (personal + shared). Empty when the table is missing. */
async function memberOrgIds(userId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase.from("investor_organisation_members").select("org_id").eq("user_id", userId);
  if (error || !data) return [];
  return (data as Row[]).map((r) => String(r.org_id)).filter(Boolean);
}

/** Every active mandate the user owns or is a seat of; default first, newest next. */
export async function listMandates(userId: string): Promise<MandateList> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return { migrated: false, mandates: [], primary: null };
  try {
    const orgIds = await memberOrgIds(userId);
    const filter = orgIds.length
      ? `owner_user_id.eq.${userId},org_id.in.(${orgIds.join(",")})`
      : `owner_user_id.eq.${userId}`;
    const { data, error } = await supabase
      .from("investor_mandates")
      .select(MANDATE_COLUMNS)
      .or(filter)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) {
      if (isMissingRelation(error)) return { migrated: false, mandates: [], primary: null };
      console.error("[blockid:mandates] list failed", error);
      return { migrated: true, mandates: [], primary: null };
    }
    const mandates = ((data ?? []) as Row[]).map(mandateFromRow);
    return { migrated: true, mandates, primary: mandates.find((m) => m.is_default) ?? mandates[0] ?? null };
  } catch (err) {
    console.error("[blockid:mandates] list threw", err);
    return { migrated: false, mandates: [], primary: null };
  }
}

/** One mandate the user may read (owner or org seat), else null. */
export async function getMandateForUser(userId: string, mandateId: string): Promise<InvestorMandate | null> {
  const list = await listMandates(userId);
  return list.mandates.find((m) => m.id === mandateId) ?? null;
}

// ─── Upsert ──────────────────────────────────────────────────────────────────

export type UpsertMandateResult =
  | { ok: true; mandate: InvestorMandate; org: InvestorOrganisation | null; created: boolean; mirror: { ok: boolean; reason?: string } }
  | { ok: false; reason: "not_migrated" | "not_configured" | "not_found" | "limit_reached" | "db_error"; limit?: number };

export interface UpsertMandateUser {
  id: string;
  plan: string | null;
  /** Evaluator persona (account_type / segment) — only then is the 0323 master flag written. */
  evaluator: boolean;
}

/**
 * Create or update one mandate (validated `MandateInput`). Bootstraps the
 * personal org, enforces the plan limit on create, writes the prefs mirror
 * and appends the `mandate.saved` audit row (field names only, never the
 * thesis body).
 */
export async function upsertMandate(user: UpsertMandateUser, input: MandateInput): Promise<UpsertMandateResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const list = await listMandates(user.id);
  if (!list.migrated) return { ok: false, reason: "not_migrated" };

  const org = await getOrCreatePersonalOrg(user.id, { name: input.label, kind: input.kind });

  const existing = input.id ? list.mandates.find((m) => m.id === input.id) ?? null : null;
  if (input.id && !existing) return { ok: false, reason: "not_found" };

  if (!existing) {
    const limit = await mandateLimitFor(user.plan);
    const owned = list.mandates.filter((m) => m.owner_user_id === user.id).length;
    if (owned >= limit) return { ok: false, reason: "limit_reached", limit };
  }

  const isDefault = input.is_default ?? (existing ? existing.is_default : list.mandates.length === 0);
  const payload: Row = {
    org_id: existing?.org_id ?? org?.id ?? null,
    owner_user_id: existing?.owner_user_id ?? user.id,
    label: input.label,
    thesis: input.thesis,
    is_default: isDefault,
    discoverable: input.discoverable,
    is_active: true,
    sectors_include: input.sectors_include,
    sectors_exclude: input.sectors_exclude,
    business_models: input.business_models,
    customer_types: input.customer_types,
    stages: input.stages,
    cheque_min_aud: input.cheque_min_aud,
    cheque_max_aud: input.cheque_max_aud,
    lead_or_follow: input.lead_or_follow,
    ownership_target_pct: input.ownership_target_pct,
    followon_reserve_pct: input.followon_reserve_pct,
    geographies: input.geographies,
    revenue_min_aud: input.revenue_min_aud,
    growth_min_pct: input.growth_min_pct,
    min_svi: input.min_svi,
    tags_include: input.tags_include,
    tags_exclude: input.tags_exclude,
    esg_constraints: input.esg_constraints,
    risk_tolerance: input.risk_tolerance,
    weights: input.weights ?? {},
  };

  let row: Row | null = null;
  try {
    if (existing) {
      const { data, error } = await supabase.from("investor_mandates").update(payload).eq("id", existing.id).select(MANDATE_COLUMNS).single();
      if (error) throw error;
      row = data as Row;
    } else {
      const { data, error } = await supabase.from("investor_mandates").insert(payload).select(MANDATE_COLUMNS).single();
      if (error) throw error;
      row = data as Row;
    }
  } catch (err) {
    if (isMissingRelation(err)) return { ok: false, reason: "not_migrated" };
    console.error("[blockid:mandates] upsert failed", err);
    return { ok: false, reason: "db_error" };
  }
  if (!row) return { ok: false, reason: "db_error" };
  const mandate = mandateFromRow(row);

  // Only one default per user.
  if (isDefault) {
    try {
      await supabase.from("investor_mandates").update({ is_default: false }).eq("owner_user_id", user.id).neq("id", mandate.id);
    } catch {
      /* best effort */
    }
  }

  // One-release mirror (R4): written from here only.
  const mirror = mandate.is_default ? await writePrefsMirror(user, mandate) : { ok: true };

  void appendAudit({
    user_id: user.id,
    actor: "user",
    action: "mandate.saved",
    resource_type: "investor_mandate",
    resource_id: mandate.id,
    detail: {
      created: !existing,
      org_id: mandate.org_id,
      sections_filled: sectionsFilled(mandate),
      changed: existing ? changedFields(existing, mandate) : Object.keys(payload),
    },
  }).catch((err: unknown) => {
    if (process.env.NODE_ENV !== "test") console.warn("[blockid:mandates] audit write skipped:", err instanceof Error ? err.message : err);
  });

  return { ok: true, mandate, org, created: !existing, mirror };
}

/** Soft-delete (is_active=false); the nightly cron drops its fit rows. */
export async function deactivateMandate(userId: string, mandateId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const mine = await getMandateForUser(userId, mandateId);
  if (!mine) return false;
  const { error } = await supabase.from("investor_mandates").update({ is_active: false, is_default: false }).eq("id", mandateId);
  return !error;
}

// ─── Mirror + read-through (one release) ─────────────────────────────────────

/** Canonical stage → the legacy investor `StageBand` (inverse of STAGE_BAND_TO_STAGE_KEYS). */
export function stageKeyToBand(stage: string): StageBand | null {
  for (const [band, keys] of Object.entries(STAGE_BAND_TO_STAGE_KEYS)) {
    if ((keys as readonly string[]).includes(stage)) return band as StageBand;
  }
  return null;
}

/** The legacy `investor_prefs` view of a mandate (what deal-flow v1 and investor-match's prefs path still read). */
export function mandateToLegacyPrefs(m: InvestorMandate): Partial<InvestorPreferences> {
  const bands = Array.from(new Set(m.stages.map(stageKeyToBand).filter((b): b is StageBand => !!b)));
  const wide = m.geographies.some((g) => ["anz", "apac", "global"].includes(g));
  const geos = m.geographies.length === 0 ? ["AU"] : wide ? ["AU", "NZ"] : ["AU"];
  return {
    sectors: m.sectors_include.slice(0, 20),
    stages: bands.length ? bands : ["any"],
    geos,
    cheque_band: chequeBandFor(m.cheque_min_aud, m.cheque_max_aud),
    min_svi: m.min_svi,
    firm: m.label || null,
    thesis: m.thesis ? m.thesis.slice(0, THESIS_MAX_LEN) : null,
  };
}

function chequeBandFor(min: number | null, max: number | null): InvestorPreferences["cheque_band"] {
  const hi = max ?? min;
  if (hi === null) return "any";
  if (hi < 25_000) return "under_25k";
  if (hi <= 100_000) return "25k_100k";
  if (hi <= 500_000) return "100k_500k";
  if (hi <= 2_000_000) return "500k_2m";
  return "2m_plus";
}

async function writePrefsMirror(user: UpsertMandateUser, m: InvestorMandate): Promise<{ ok: boolean; reason?: string }> {
  try {
    const prefs = await setInvestorPreferences(user.id, mandateToLegacyPrefs(m));
    if (user.evaluator) {
      const flag = await setInvestorDiscoverable(user.id, m.discoverable);
      if (!flag.ok && flag.reason !== "column_missing") return { ok: false, reason: flag.reason };
    }
    return prefs.ok || prefs.reason === "column_missing" ? { ok: true } : { ok: false, reason: prefs.reason };
  } catch (err) {
    console.warn("[blockid:mandates] prefs mirror failed", err instanceof Error ? err.message : err);
    return { ok: false, reason: "db_error" };
  }
}

/** A form draft from the OLD prefs (read-through while the mirror lives). Pure given the prefs. */
export function legacyPrefsToDraft(prefs: Partial<InvestorPreferences> | null | undefined, discoverable = false): MandateInputRaw {
  const p = prefs ?? {};
  const sectors = Array.from(
    new Set((Array.isArray(p.sectors) ? p.sectors : []).map((s) => crosswalkIndustry(String(s))).filter((i) => i !== "unclassified")),
  );
  const stages = Array.from(
    new Set(
      (Array.isArray(p.stages) ? p.stages : [])
        .flatMap((b) => (b === "any" ? [] : (STAGE_BAND_TO_STAGE_KEYS[String(b)] ?? [])) as readonly StageKey[])
        .map(String),
    ),
  );
  return {
    label: typeof p.firm === "string" && p.firm.trim() ? p.firm.trim().slice(0, MANDATE_LABEL_MAX_LEN) : "",
    kind: "angel",
    thesis: typeof p.thesis === "string" && p.thesis.trim() ? p.thesis.trim().slice(0, MANDATE_THESIS_MAX_LEN) : null,
    discoverable,
    sectors_include: sectors as MandateInputRaw["sectors_include"],
    stages: stages as MandateInputRaw["stages"],
    min_svi: typeof p.min_svi === "number" ? Math.max(0, Math.min(100, Math.round(p.min_svi))) : null,
  };
}

/** Prefill for the form: the user's primary mandate, else the legacy prefs read-through. */
export async function mandateDraftFor(userId: string, discoverable: boolean): Promise<{ draft: MandateInputRaw; source: "mandate" | "prefs" | "empty"; mandateId: string | null }> {
  const list = await listMandates(userId);
  if (list.primary) {
    const m = list.primary;
    return {
      mandateId: m.id,
      source: "mandate",
      draft: {
        id: m.id,
        label: m.label,
        kind: "angel",
        thesis: m.thesis,
        discoverable: m.discoverable,
        is_default: m.is_default,
        sectors_include: m.sectors_include as MandateInputRaw["sectors_include"],
        sectors_exclude: m.sectors_exclude as MandateInputRaw["sectors_exclude"],
        business_models: m.business_models as MandateInputRaw["business_models"],
        customer_types: m.customer_types as MandateInputRaw["customer_types"],
        stages: m.stages as MandateInputRaw["stages"],
        cheque_min_aud: m.cheque_min_aud,
        cheque_max_aud: m.cheque_max_aud,
        lead_or_follow: m.lead_or_follow,
        ownership_target_pct: m.ownership_target_pct,
        followon_reserve_pct: m.followon_reserve_pct,
        geographies: m.geographies as MandateInputRaw["geographies"],
        revenue_min_aud: m.revenue_min_aud,
        growth_min_pct: m.growth_min_pct,
        min_svi: m.min_svi,
        tags_include: m.tags_include as MandateInputRaw["tags_include"],
        tags_exclude: m.tags_exclude as MandateInputRaw["tags_exclude"],
        esg_constraints: m.esg_constraints as MandateInputRaw["esg_constraints"],
        risk_tolerance: m.risk_tolerance,
        weights: Object.keys(m.weights).length ? (m.weights as MandateInputRaw["weights"]) : null,
      },
    };
  }
  const prefs = await getInvestorPreferences(userId);
  const hasPrefs = (prefs.sectors?.length ?? 0) > 0 || (prefs.stages ?? []).some((s) => s !== "any") || !!prefs.firm || !!prefs.thesis || prefs.min_svi !== null;
  return { mandateId: null, source: hasPrefs ? "prefs" : "empty", draft: legacyPrefsToDraft(prefs, discoverable) };
}

// ─── Analytics / audit helpers (pure) ────────────────────────────────────────

/** How many of the 7 sections carry a non-default value (GA4 `mandate_saved.sections_filled`). */
export function sectionsFilled(m: Pick<InvestorMandate, "label" | "thesis" | "sectors_include" | "sectors_exclude" | "business_models" | "customer_types" | "stages" | "cheque_min_aud" | "cheque_max_aud" | "lead_or_follow" | "ownership_target_pct" | "followon_reserve_pct" | "geographies" | "revenue_min_aud" | "growth_min_pct" | "min_svi" | "tags_include" | "tags_exclude" | "esg_constraints" | "risk_tolerance" | "weights">): number {
  let n = 0;
  if (m.label || m.thesis) n += 1;
  if (m.sectors_include.length || m.sectors_exclude.length || m.business_models.length || m.customer_types.length) n += 1;
  if (m.stages.length || m.cheque_min_aud !== null || m.cheque_max_aud !== null || m.lead_or_follow || m.ownership_target_pct !== null || m.followon_reserve_pct !== null) n += 1;
  if (m.geographies.length) n += 1;
  if (m.revenue_min_aud !== null || m.growth_min_pct !== null || m.min_svi !== null) n += 1;
  if (m.tags_include.length || m.tags_exclude.length || m.esg_constraints.length || m.risk_tolerance) n += 1;
  if (m.weights && Object.keys(m.weights).length) n += 1;
  return n;
}

const DIFF_FIELDS = [
  "label", "thesis", "discoverable", "is_default", "sectors_include", "sectors_exclude", "business_models", "customer_types", "stages",
  "cheque_min_aud", "cheque_max_aud", "lead_or_follow", "ownership_target_pct", "followon_reserve_pct", "geographies", "revenue_min_aud",
  "growth_min_pct", "min_svi", "tags_include", "tags_exclude", "esg_constraints", "risk_tolerance", "weights",
] as const;

/** Field NAMES that differ (audit detail carries deltas, never note bodies — §C.2). */
export function changedFields(a: InvestorMandate, b: InvestorMandate): string[] {
  return DIFF_FIELDS.filter((f) => JSON.stringify(a[f] ?? null) !== JSON.stringify(b[f] ?? null));
}
