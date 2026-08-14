import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectById, updateProject, archiveProject } from "@/lib/projects";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";
import { assertProjectMemberCan } from "@/lib/project-members/scope";

export const dynamic = "force-dynamic";

// PATCH /api/projects/[id] — update a project
// Body: { name?: string, description?: string, industry?: string }
export async function PATCH(
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

  // Verify project exists (surface 404 vs 403 distinctly for UX).
  const project = await getProjectById(id);
  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Project not found" },
      { status: 404 },
    );
  }

  // Member-aware write guard: owner OR accepted admin/editor may PATCH.
  // Viewers, invited, and revoked members are rejected with 403.
  try {
    await assertProjectMemberCan(id, user.id, "write");
  } catch {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403 },
    );
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

  // Return updated project
  const updated = await getProjectById(id);
  return NextResponse.json({ ok: true, project: updated });
}

// DELETE /api/projects/[id] — archive (soft delete) a project
export async function DELETE(
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

  // Verify project exists (surface 404 vs 403 distinctly for UX).
  const project = await getProjectById(id);
  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Project not found" },
      { status: 404 },
    );
  }

  // Member-aware write guard: owner OR accepted admin/editor may archive.
  try {
    await assertProjectMemberCan(id, user.id, "write");
  } catch {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403 },
    );
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
    fields: { was_default: Boolean(project.isDefault) },
    route: `/api/projects/${id}`,
    ip: extractIp(request.headers),
    ua: extractUserAgent(request.headers),
  });

  return NextResponse.json({ ok: true });
}
