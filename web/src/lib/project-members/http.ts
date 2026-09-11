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
