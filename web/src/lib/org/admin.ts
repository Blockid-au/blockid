// Institutional admin (G21 P3-B) — who may open /workspace/settings/audit
// (organisation export) and /workspace/settings/retention, and read / write
// `org_settings` (migration 0428).
//
//   resolveOrgAdmin(user)  → { status: "ok", org, seats } for the OWNER of an
//                            organisation (investor_organisations.owner_user_id,
//                            or an explicit `owner` seat) whose org is an
//                            organisation — a team (≥ 2 seats), a non-personal
//                            org, or an owner on a plan that carries `api.access`
//                            (Fund / Program / Index API);
//                            "individual" for a Free / solo evaluator (the pages
//                            render the "for organisations" card);
//                            "not_owner" for an invited seat;
//                            "no_org" when the tables are absent / no org.
//
//   readOrgSettings / writeOrgSettings — the actor is recorded on the audit
//   row (`org.settings.updated`, before → after), never on the table (no
//   app_users FK by design: the erasure map is unchanged).
//
// Every reader is fail-soft before 0393 / 0428.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { can } from "@/lib/entitlements";
import { isMissingRelation, type InvestorOrganisation } from "@/lib/investors/mandates";
import { listSeatUserIds, resolveActingOrg } from "@/lib/investor/organisations";

type Row = Record<string, unknown>;

export const RETENTION_MIN_DAYS = 30;
export const RETENTION_MAX_DAYS = 3650;

export interface OrgSettings {
  orgId: string;
  /** Null = keep everything. */
  retentionDays: number | null;
  auditExportEnabled: boolean;
  updatedAt: string | null;
  /** False before migration 0428 (the row cannot be read or written). */
  available: boolean;
}

export type OrgAdminStatus = "ok" | "individual" | "not_owner" | "no_org";

export interface OrgAdmin {
  status: OrgAdminStatus;
  org: InvestorOrganisation | null;
  /** Seat user ids (owner included) — the actors whose audit rows the export covers. */
  seats: string[];
  isOwner: boolean;
}

export const ORG_OWNER_ROLES: ReadonlySet<string> = new Set(["owner", "institutional_admin"]);

/** Pure: is `userId` an owner of `org` given their explicit seat role? */
export function isOrgOwner(org: Pick<InvestorOrganisation, "owner_user_id">, userId: string, seatRole: string | null): boolean {
  if (org.owner_user_id === userId) return true;
  return !!seatRole && ORG_OWNER_ROLES.has(seatRole);
}

/** Pure: does this org count as an organisation (vs a solo evaluator)? */
export function isInstitutionalOrg(org: Pick<InvestorOrganisation, "is_personal">, seatCount: number, ownerHasApiAccess: boolean): boolean {
  return !org.is_personal || seatCount >= 2 || ownerHasApiAccess;
}

async function seatRoleOf(orgId: string, userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("investor_organisation_members").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
    if (error || !data) return null;
    return typeof (data as Row).role === "string" ? String((data as Row).role) : null;
  } catch {
    return null;
  }
}

/** The caller's institutional-admin standing. */
export async function resolveOrgAdmin(user: { id: string; plan: string | null }): Promise<OrgAdmin> {
  const org = await resolveActingOrg(user.id);
  if (!org) return { status: "no_org", org: null, seats: [], isOwner: false };
  const [seats, seatRole] = await Promise.all([listSeatUserIds(org.id), seatRoleOf(org.id, user.id)]);
  const allSeats = Array.from(new Set([...(org.owner_user_id ? [org.owner_user_id] : []), ...seats]));
  const owner = isOrgOwner(org, user.id, seatRole);
  if (!owner) return { status: "not_owner", org, seats: allSeats, isOwner: false };
  let apiAccess = false;
  try {
    apiAccess = await can({ id: user.id, plan: user.plan ?? "free", segment: "investor" }, "api.access");
  } catch {
    apiAccess = false;
  }
  if (!isInstitutionalOrg(org, allSeats.length, apiAccess)) return { status: "individual", org, seats: allSeats, isOwner: true };
  return { status: "ok", org, seats: allSeats, isOwner: true };
}

function mapSettings(orgId: string, r: Row | null): OrgSettings {
  return {
    orgId,
    retentionDays: r && typeof r.retention_days === "number" ? r.retention_days : r && typeof r.retention_days === "string" && r.retention_days !== "" ? Number(r.retention_days) : null,
    auditExportEnabled: r ? r.audit_export_enabled !== false : true,
    updatedAt: r && typeof r.updated_at === "string" ? r.updated_at : null,
    available: true,
  };
}

/** The org's settings (defaults when no row yet; `available: false` before 0428). */
export async function readOrgSettings(orgId: string): Promise<OrgSettings> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ...mapSettings(orgId, null), available: false };
  try {
    const { data, error } = await supabase.from("org_settings").select("org_id, retention_days, audit_export_enabled, updated_at").eq("org_id", orgId).maybeSingle();
    if (error) {
      if (!isMissingRelation(error)) console.error("[blockid:org-settings] read failed", { code: error.code, message: error.message });
      return { ...mapSettings(orgId, null), available: false };
    }
    return mapSettings(orgId, (data as Row | null) ?? null);
  } catch {
    return { ...mapSettings(orgId, null), available: false };
  }
}

export interface OrgSettingsPatch {
  retentionDays?: number | null;
  auditExportEnabled?: boolean;
}

export type WriteSettingsResult = { ok: true; settings: OrgSettings } | { ok: false; error: "invalid" | "unavailable" | "db_error"; message: string };

/** Pure: validate a patch (retention 30–3650 or null). */
export function validateSettingsPatch(patch: OrgSettingsPatch): { ok: true; patch: OrgSettingsPatch } | { ok: false; message: string } {
  const out: OrgSettingsPatch = {};
  if ("retentionDays" in patch) {
    const v = patch.retentionDays;
    if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < RETENTION_MIN_DAYS || v > RETENTION_MAX_DAYS)) {
      return { ok: false, message: `retention_days must be null (keep) or a whole number between ${RETENTION_MIN_DAYS} and ${RETENTION_MAX_DAYS}.` };
    }
    out.retentionDays = v ?? null;
  }
  if ("auditExportEnabled" in patch) {
    if (typeof patch.auditExportEnabled !== "boolean") return { ok: false, message: "audit_export_enabled must be true or false." };
    out.auditExportEnabled = patch.auditExportEnabled;
  }
  if (Object.keys(out).length === 0) return { ok: false, message: "Nothing to change." };
  return { ok: true, patch: out };
}

/** Upsert the org's settings and record the actor + before/after on the audit ledger. */
export async function writeOrgSettings(orgId: string, patch: OrgSettingsPatch, actor: { id: string }): Promise<WriteSettingsResult> {
  const valid = validateSettingsPatch(patch);
  if (!valid.ok) return { ok: false, error: "invalid", message: valid.message };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Settings are not available on this deployment." };
  const before = await readOrgSettings(orgId);
  if (!before.available) return { ok: false, error: "unavailable", message: "Organisation settings are not available yet (migration 0428)." };
  const row: Row = { org_id: orgId };
  if ("retentionDays" in valid.patch) row.retention_days = valid.patch.retentionDays;
  if ("auditExportEnabled" in valid.patch) row.audit_export_enabled = valid.patch.auditExportEnabled;
  const { data, error } = await supabase.from("org_settings").upsert(row, { onConflict: "org_id" }).select("org_id, retention_days, audit_export_enabled, updated_at").maybeSingle();
  if (error) {
    console.error("[blockid:org-settings] write failed", { code: error.code, message: error.message });
    return { ok: false, error: "db_error", message: "The settings could not be saved. Please try again." };
  }
  const settings = mapSettings(orgId, (data as Row | null) ?? row);
  try {
    await appendAudit({
      user_id: actor.id,
      actor: "user",
      action: "org.settings.updated",
      resource_type: "investor_organisation",
      resource_id: orgId,
      detail: {
        before: { retention_days: before.retentionDays, audit_export_enabled: before.auditExportEnabled },
        after: { retention_days: settings.retentionDays, audit_export_enabled: settings.auditExportEnabled },
      },
    });
  } catch (err) {
    console.error("[blockid:org-settings] audit append failed", err instanceof Error ? err.message : err);
  }
  return { ok: true, settings };
}
