// Pure builders for the four P12.4 detail panels on /admin/users/[id]:
//
//   1. Roles & permissions      — parse app_users.custom_role + permissions jsonb
//   2. Attribution history      — reseller_attributions rows for this user
//   3. Reseller admin membership — reseller_admins rows for this user
//   4. Advisor client list      — advisor_clients rows where the user is the advisor
//
// Kept as pure functions (no Supabase types) so the panels can be unit-tested
// without the network. The server component in
// web/src/app/admin/users/[id]/page.tsx runs the raw queries and hands the
// rows off to these builders.

export const KNOWN_PERMISSIONS = [
  "reseller.console",
  "advisor_portal",
  "esop.manage",
  "cap_table.write",
  "vesting.write",
  "blockchain.sync",
  "data_room.write",
  "share_management",
] as const;

export type KnownPermission = (typeof KNOWN_PERMISSIONS)[number];

export interface RolesPermissionsPanel {
  base_role: "admin" | "user";
  custom_role: string | null;
  permissions: string[];
  known_permissions: readonly string[];
  unknown_permissions: string[];
}

export interface AttributionHistoryRow {
  reseller_id: string;
  reseller_code: string | null;
  reseller_display_name: string | null;
  subject_type: "user" | "project";
  subject_project_id: string | null;
  source: "code" | "provisioned" | "admin_manual" | string;
  status: "active" | "revoked" | string;
  opted_out: boolean;
  opted_out_at_iso: string | null;
  attributed_at_iso: string;
}

export interface ResellerAdminMembershipRow {
  reseller_id: string;
  reseller_code: string | null;
  reseller_display_name: string | null;
  membership_role: "owner" | "admin" | "viewer" | string;
  status: "active" | "revoked" | string;
  linked_at_iso: string;
  revoked_at_iso: string | null;
}

export interface AdvisorClientRow {
  client_id: string;
  client_email: string | null;
  client_display_name: string | null;
  status: "active" | "revoked" | string;
  linked_at_iso: string;
}

interface UserRow {
  role: string | null;
  custom_role: string | null;
  permissions: unknown;
}

/**
 * Normalise the raw app_users row into the Roles & permissions panel shape.
 *
 * `permissions` may arrive from PostgREST as jsonb (already a JS array) or as
 * a JSON-encoded string, or null when the column defaults to '[]'. All three
 * shapes are folded into a string[] and de-duped in insertion order.
 */
export function buildRolesPermissionsPanel(user: UserRow): RolesPermissionsPanel {
  const baseRole: "admin" | "user" = user.role === "admin" ? "admin" : "user";

  let raw: unknown = user.permissions;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }

  const perms: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === "string" && entry.trim() && !seen.has(entry)) {
        seen.add(entry);
        perms.push(entry);
      }
    }
  }

  const knownSet = new Set<string>(KNOWN_PERMISSIONS);
  const unknown = perms.filter((p) => !knownSet.has(p));

  const customRoleRaw = (user.custom_role ?? "").trim();

  return {
    base_role: baseRole,
    custom_role: customRoleRaw.length > 0 ? customRoleRaw : null,
    permissions: perms,
    known_permissions: KNOWN_PERMISSIONS,
    unknown_permissions: unknown,
  };
}

interface AttributionRawRow {
  reseller_id: string;
  subject_type: string | null;
  subject_project_id: string | null;
  source: string | null;
  status: string | null;
  opted_out: boolean | null;
  opted_out_at: string | null;
  attributed_at: string | null;
}

interface ResellerLookupRow {
  id: string;
  code: string | null;
  display_name: string | null;
}

/**
 * Sort attribution rows newest-first and join reseller code/display_name from
 * the provided lookup map. Rows missing a resolvable reseller keep null
 * code/display_name — the admin panel renders "—" so the row is not hidden.
 */
export function buildAttributionHistory(
  rows: AttributionRawRow[],
  resellers: ReadonlyMap<string, ResellerLookupRow>,
): AttributionHistoryRow[] {
  const enriched = rows.map((r): AttributionHistoryRow => {
    const lookup = resellers.get(r.reseller_id);
    return {
      reseller_id: r.reseller_id,
      reseller_code: lookup?.code ?? null,
      reseller_display_name: lookup?.display_name ?? null,
      subject_type: r.subject_type === "project" ? "project" : "user",
      subject_project_id: r.subject_project_id,
      source: r.source ?? "unknown",
      status: r.status ?? "unknown",
      opted_out: Boolean(r.opted_out),
      opted_out_at_iso: r.opted_out_at,
      attributed_at_iso: r.attributed_at ?? new Date(0).toISOString(),
    };
  });
  enriched.sort((a, b) => b.attributed_at_iso.localeCompare(a.attributed_at_iso));
  return enriched;
}

interface ResellerAdminRawRow {
  reseller_id: string;
  role: string | null;
  status: string | null;
  linked_at: string | null;
  revoked_at: string | null;
}

/**
 * Sort reseller_admins rows: active status first, then newest linked_at.
 */
export function buildResellerAdminMembership(
  rows: ResellerAdminRawRow[],
  resellers: ReadonlyMap<string, ResellerLookupRow>,
): ResellerAdminMembershipRow[] {
  const enriched = rows.map((r): ResellerAdminMembershipRow => {
    const lookup = resellers.get(r.reseller_id);
    return {
      reseller_id: r.reseller_id,
      reseller_code: lookup?.code ?? null,
      reseller_display_name: lookup?.display_name ?? null,
      membership_role: r.role ?? "admin",
      status: r.status ?? "unknown",
      linked_at_iso: r.linked_at ?? new Date(0).toISOString(),
      revoked_at_iso: r.revoked_at,
    };
  });
  enriched.sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "active") return -1;
      if (b.status === "active") return 1;
    }
    return b.linked_at_iso.localeCompare(a.linked_at_iso);
  });
  return enriched;
}

interface AdvisorClientRawRow {
  client_id: string;
  status: string | null;
  linked_at: string | null;
}

interface AppUserLookupRow {
  id: string;
  email: string | null;
  display_name: string | null;
}

/**
 * Enrich advisor_clients rows with the client's email + display_name. Sort by
 * status (active first) then linked_at desc.
 */
export function buildAdvisorClientList(
  rows: AdvisorClientRawRow[],
  clients: ReadonlyMap<string, AppUserLookupRow>,
): AdvisorClientRow[] {
  const enriched = rows.map((r): AdvisorClientRow => {
    const lookup = clients.get(r.client_id);
    return {
      client_id: r.client_id,
      client_email: lookup?.email ?? null,
      client_display_name: lookup?.display_name ?? null,
      status: r.status ?? "unknown",
      linked_at_iso: r.linked_at ?? new Date(0).toISOString(),
    };
  });
  enriched.sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "active") return -1;
      if (b.status === "active") return 1;
    }
    return b.linked_at_iso.localeCompare(a.linked_at_iso);
  });
  return enriched;
}
