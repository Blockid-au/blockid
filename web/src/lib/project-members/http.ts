// HTTP adapters for project-level permission errors (S17-A).
//
// Route handlers wrap `getProjectScope(minRole)` / `assertProjectAccess()`
// and hand any thrown error to `projectAccessResponse()`. It maps a
// `ProjectAccessError` to the right JSON envelope + status and returns
// `null` for anything else so the caller can rethrow / 500 as before.
//
// Duck-typed on `name`/`code` (not `instanceof`) so colocated route tests
// that mock `@/lib/projects` do not have to re-export the error class.

import { NextResponse } from "next/server";
import { getProjectScope } from "@/lib/projects";
import type { ProjectMemberRole, ProjectScope } from "@/lib/projects";

type AccessCode = "not_found" | "forbidden" | "service_unavailable";

const STATUS: Record<AccessCode, number> = {
  not_found: 404,
  forbidden: 403,
  service_unavailable: 503,
};

const MESSAGE: Record<AccessCode, string> = {
  not_found: "Project not found",
  forbidden: "Forbidden — your role on this project does not allow this action",
  service_unavailable: "Service unavailable",
};

export function isProjectAccessError(
  err: unknown,
): err is Error & { code: AccessCode } {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; code?: unknown };
  return (
    e.name === "ProjectAccessError" &&
    (e.code === "not_found" || e.code === "forbidden" || e.code === "service_unavailable")
  );
}

/**
 * `NextResponse` for a `ProjectAccessError`, or `null` when `err` is
 * something else (caller decides what to do with it).
 */
export function projectAccessResponse(err: unknown): NextResponse | null {
  if (!isProjectAccessError(err)) return null;
  return NextResponse.json(
    { ok: false, error: MESSAGE[err.code], code: err.code },
    { status: STATUS[err.code] },
  );
}

/**
 * S18-A — one-liner for route handlers: resolve the request's project
 * scope at `minRole`, or hand back the 403/404/503 response to return.
 *
 *   const { scope, denied } = await projectScopeOrDeny("editor");
 *   if (denied) return denied;
 *   const dataEmail = scope?.dataEmail ?? user.email;
 *
 * `scope` is `null` (not an error) when the caller has no resolvable
 * project — the route then falls back to the caller's OWN legacy record,
 * never another user's. Any non-access error is rethrown untouched.
 */
/**
 * S18-A — for actions reserved to the project OWNER (token minting, billing
 * state): `getProjectScope("admin")` lets an admin through, so routes call
 * this afterwards. Returns the 403 to send, or `null` when the caller is
 * the owner (or has no shared project at all — legacy own-data path).
 */
export function ownerOnlyDenied(
  scope: Pick<ProjectScope, "isOwner"> | null | undefined,
): NextResponse | null {
  if (!scope || scope.isOwner) return null;
  return NextResponse.json(
    { ok: false, error: "Forbidden — only the project owner can do this", code: "forbidden" },
    { status: 403 },
  );
}

/**
 * S18-A — variant for browser-redirect flows (OAuth callbacks): a refused
 * role redirects to `redirectTo` with `?error=<errorCode>` instead of a
 * JSON 4xx, because the caller is a browser mid-redirect, not fetch().
 * Any non-access error is rethrown untouched.
 */
export async function projectScopeOrRedirect(
  minRole: ProjectMemberRole,
  redirectTo: string,
  errorCode: string,
): Promise<
  | { scope: ProjectScope | null; denied: null }
  | { scope: null; denied: NextResponse }
> {
  try {
    const scope = await getProjectScope(minRole);
    return { scope, denied: null };
  } catch (err) {
    if (!isProjectAccessError(err)) throw err;
    const url = new URL(redirectTo);
    url.searchParams.set("error", errorCode);
    url.searchParams.set("code", err.code);
    return { scope: null, denied: NextResponse.redirect(url.toString()) };
  }
}

export async function projectScopeOrDeny(
  minRole?: ProjectMemberRole,
): Promise<
  | { scope: ProjectScope | null; denied: null }
  | { scope: null; denied: NextResponse }
> {
  try {
    const scope = await getProjectScope(minRole);
    return { scope, denied: null };
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return { scope: null, denied };
    throw err;
  }
}
