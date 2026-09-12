// S18-B — helpers for SERVER PAGES under `(founder)`.
//
// Every page resolves `const scope = await getProjectScope("viewer")`
// (null → the owner's legacy no-project path, exactly as
// `getProjectIdFromRequest()` behaved) and derives its data keys through
// `pageScopeKeys()`:
//
//   projectId    cookie-selected project (or null)
//   dataEmail    the OWNER's email — the key svi_accounts / svi_analyses /
//                startup_metrics rows live under (caller's own when no scope)
//   ownerUserId  the OWNER's app_users id — the key founder-feature, ESOP
//                and investor-pack rows live under
//   role/canEdit the caller's role → client components receive `readOnly`
//   isMember     true for an accepted member (never the owner)
//
// `resolveSVIAccountIdForPage()` replaces the `findOrCreateSVIAccount(
// user.email, projectId)` pattern: the owner still find-or-creates their
// own record, but a member only READS the owner's row — a page render must
// never insert a split `svi_accounts(memberEmail, ownerProjectId)` row
// (S18-A review P2-3).

import {
  findOrCreateSVIAccount,
  findSVIAccountWithFallback,
  roleCanWrite,
} from "@/lib/projects";
import type { ProjectRole, ProjectScope } from "@/lib/projects";

export interface PageScopeKeys {
  scope: ProjectScope | null;
  projectId: string | null;
  dataEmail: string;
  ownerUserId: string;
  role: ProjectRole;
  /** editor / admin / owner (or no shared project at all). */
  canEdit: boolean;
  /** Accepted member of someone else's project. */
  isMember: boolean;
}

export function pageScopeKeys(
  scope: ProjectScope | null | undefined,
  user: { id: string; email: string },
): PageScopeKeys {
  const role: ProjectRole = scope?.role ?? "owner";
  return {
    scope: scope ?? null,
    projectId: scope?.projectId ?? null,
    dataEmail: scope?.dataEmail ?? user.email,
    ownerUserId: scope?.ownerUserId ?? user.id,
    role,
    canEdit: roleCanWrite(role),
    isMember: Boolean(scope && !scope.isOwner),
  };
}

/**
 * svi_accounts id for a page render.
 *
 * - owner / no scope → `findOrCreateSVIAccount(ownEmail, projectId)` — the
 *   legacy behaviour, unchanged (first dashboard visit creates the record).
 * - member → read-only `findSVIAccountWithFallback(ownerEmail, projectId,
 *   { callerEmail })`; `null` when the owner has no record yet, so the page
 *   renders its empty state instead of creating a row under the member.
 */
export async function resolveSVIAccountIdForPage(
  scope: ProjectScope | null | undefined,
  user: { email: string },
): Promise<string | null> {
  if (!scope || scope.isOwner) {
    return findOrCreateSVIAccount(scope?.dataEmail ?? user.email, scope?.projectId ?? null);
  }
  const row = await findSVIAccountWithFallback(scope.dataEmail, scope.projectId, "id", {
    callerEmail: user.email,
  });
  const id = row?.id;
  return typeof id === "string" ? id : null;
}
