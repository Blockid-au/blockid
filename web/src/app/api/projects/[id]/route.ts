import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectById, updateProject, archiveProject } from "@/lib/projects";

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

  // Verify ownership
  const project = await getProjectById(id);
  if (!project || project.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Project not found" },
      { status: 404 },
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

  const { name, description, industry } = (body as {
    name?: string;
    description?: string;
    industry?: string;
  }) ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    return NextResponse.json(
      { ok: false, error: "Project name cannot be empty" },
      { status: 400 },
    );
  }

  const result = await updateProject(id, { name, description, industry });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 },
    );
  }

  // Return updated project
  const updated = await getProjectById(id);
  return NextResponse.json({ ok: true, project: updated });
}

// DELETE /api/projects/[id] — archive (soft delete) a project
export async function DELETE(
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

  // Verify ownership
  const project = await getProjectById(id);
  if (!project || project.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Project not found" },
      { status: 404 },
    );
  }

  const result = await archiveProject(id);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true });
}
