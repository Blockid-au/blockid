import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  updateProject,
  archiveProject,
  assertProjectAccess,
  ProjectAccessError,
  getProject,
} from "@/lib/projects";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

// S17-A — project settings are member-aware:
//   GET    → viewer+  (owner / admin / editor / viewer)
//   PATCH  → editor+
//   DELETE → admin+   (archive is destructive; viewers/editors are refused)
// Non-members get 404 (the project's existence is not confirmed).

function accessErrorResponse(err: unknown) {
  if (err instanceof ProjectAccessError) {
    const error =
      err.code === "not_found"
        ? "Project not found"
        : err.code === "forbidden"
          ? "Forbidden"
          : "Service unavailable";
    return NextResponse.json({ ok: false, error }, { status: err.status });
  }
  console.error("[blockid:projects] access check failed", err);
  return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
}

// GET /api/projects/[id] — read a project (with the caller's role)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }
  const { id } = await params;
  try {
    const access = await assertProjectAccess(user.id, id, "viewer");
    return NextResponse.json({ ok: true, project: access.project, role: access.role });
  } catch (err) {
    return accessErrorResponse(err);
  }
}

// PATCH /api/projects/[id] — update a project
// Body: { name?: string, description?: string, industry?: string }
async function PATCH_handler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const { id } = await params;

  // Member-aware write guard: owner OR accepted admin/editor may PATCH.
  // Viewers get 403; non-members and missing projects get 404.
  try {
    await assertProjectAccess(user.id, id, "editor");
  } catch (err) {
    return accessErrorResponse(err);
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { name, description, industry, github_url } = (body as {
    name?: string;
    description?: string;
    industry?: string;
    github_url?: string | null;
  }) ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    return NextResponse.json(
      { ok: false, error: "Project name cannot be empty" },
      { status: 400 },
    );
  }

  // Validate github_url if provided
  if (github_url !== undefined && github_url !== null && github_url !== "") {
    if (typeof github_url !== "string" || !github_url.startsWith("https://github.com/")) {
      return NextResponse.json(
        { ok: false, error: "GitHub URL must start with https://github.com/" },
        { status: 400 },
      );
    }
  }

  const result = await updateProject(id, {
    name,
    description,
    industry,
    githubUrl: github_url !== undefined ? (github_url ?? null) : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 },
    );
  }

  // SOC2-lite audit: record which top-level fields the caller touched.
  // We log KEYS ONLY — never values — so plaintext names/descriptions
  // never land in the audit row. PII-free by construction.
  const changed: string[] = [];
  if (name !== undefined) changed.push("name");
  if (description !== undefined) changed.push("description");
  if (industry !== undefined) changed.push("industry");
  if (github_url !== undefined) changed.push("github_url");
  await logUserAction({
    userId: user.id,
    action: "project.updated",
    subjectType: "project",
    subjectId: id,
    fields: { changed },
    route: `/api/projects/${id}`,
    ip: extractIp(request.headers),
    ua: extractUserAgent(request.headers),
  });

  // Return updated project (with the caller's role)
  const updated = await getProject(user.id, id);
  return NextResponse.json({ ok: true, project: updated });
}

// DELETE /api/projects/[id] — archive (soft delete) a project
async function DELETE_handler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const { id } = await params;

  // Member-aware guard: owner OR accepted admin may archive.
  let wasDefault = false;
  try {
    const access = await assertProjectAccess(user.id, id, "admin");
    wasDefault = Boolean(access.project.isDefault);
  } catch (err) {
    return accessErrorResponse(err);
  }

  const result = await archiveProject(id);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 422 },
    );
  }

  // SOC2-lite audit: record successful project archive. Never throws.
  await logUserAction({
    userId: user.id,
    action: "project.archive",
    subjectType: "project",
    subjectId: id,
    fields: { was_default: wasDefault },
    route: `/api/projects/${id}`,
    ip: extractIp(request.headers),
    ua: extractUserAgent(request.headers),
  });

  return NextResponse.json({ ok: true });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/projects/[id]/route.ts", method: "PATCH" }, PATCH_handler);
export const DELETE = apiRoute({ route: "api/projects/[id]/route.ts", method: "DELETE" }, DELETE_handler);
