// Pure helpers for the P12.6 permissions endpoint.
//
// POST /api/admin/users/[id]/permissions carries { action, permission }; the
// route resolves current permissions from app_users.permissions (jsonb array)
// and hands the raw value + body here for validation + array mutation. The
// helpers stay side-effect-free so the branch can be unit-tested without
// Supabase.

import { KNOWN_PERMISSIONS } from "./user-panels";

export const PERMISSION_ACTIONS = ["grant", "revoke"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

// Accept known permissions plus any ad-hoc slug that matches the reserved
// vocabulary shape: lowercase alnum + underscore + dot, must start with a
// letter, 1..64 chars. Wider than KNOWN_PERMISSIONS so an admin can grant a
// forward-looking capability (e.g. "reports.export") before P12.4's panel
// gets updated — the detail panel already surfaces unknown entries in an
// amber ring so the audit trail is not silent.
const PERMISSION_SLUG = /^[a-z][a-z0-9_.]{0,63}$/;

export interface RawPermissionBody {
  action?: unknown;
  permission?: unknown;
}

export interface NormalisedBody {
  action: PermissionAction;
  permission: string;
}

export type BodyValidationError =
  | "invalid_body"
  | "action_invalid"
  | "permission_invalid"
  | "permission_slug_invalid";

export type BodyValidation =
  | { ok: true; value: NormalisedBody }
  | { ok: false; reason: BodyValidationError };

/**
 * Coerce the raw request body into a NormalisedBody or return the specific
 * validation error code the route surfaces as 400. Keeps the route thin.
 */
export function validatePermissionBody(raw: unknown): BodyValidation {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid_body" };
  const body = raw as RawPermissionBody;

  if (typeof body.action !== "string") return { ok: false, reason: "action_invalid" };
  const action = body.action as PermissionAction;
  if (!(PERMISSION_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, reason: "action_invalid" };
  }

  if (typeof body.permission !== "string") {
    return { ok: false, reason: "permission_invalid" };
  }
  const permission = body.permission.trim();
  if (permission.length === 0) return { ok: false, reason: "permission_invalid" };
  if (!PERMISSION_SLUG.test(permission)) {
    return { ok: false, reason: "permission_slug_invalid" };
  }

  return { ok: true, value: { action, permission } };
}

/**
 * Fold whatever the app_users.permissions column returned into string[].
 *
 * PostgREST can hand back a JS array (jsonb decoded), a JSON-encoded string
 * (some clients), or null (column default '[]'). All three shapes collapse
 * here; unknown/non-string entries are dropped so a hand-edited malformed
 * row cannot poison the mutation.
 */
export function normalisePermissionsColumn(raw: unknown): string[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export interface MutationResult {
  next: string[];
  changed: boolean;
  was_known: boolean;
}

/**
 * Apply grant/revoke to the current permissions array. Insertion order is
 * preserved so the audit trail reads chronologically (P12.4 renders entries
 * in the order stored). Grant is a no-op if the permission is already
 * present; revoke is a no-op if it is absent — the route surfaces both
 * cases as { unchanged: true } rather than 400.
 */
export function applyPermissionMutation(
  current: string[],
  action: PermissionAction,
  permission: string,
): MutationResult {
  const knownSet = new Set<string>(KNOWN_PERMISSIONS);
  const was_known = knownSet.has(permission);
  const has = current.indexOf(permission) !== -1;

  if (action === "grant") {
    if (has) return { next: current, changed: false, was_known };
    return { next: [...current, permission], changed: true, was_known };
  }
  // revoke
  if (!has) return { next: current, changed: false, was_known };
  return {
    next: current.filter((p) => p !== permission),
    changed: true,
    was_known,
  };
}
