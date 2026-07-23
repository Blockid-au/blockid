// Project archiving endpoint — Q4 Multi-project #5 (iteration-12 T1).
//
// Soft-delete gate for founder-owned startup profiles. POST archives (sets
// projects.archived_at = now()); DELETE restores (clears archived_at, subject
// to the plan's active-project quota). Never touches DELETE FROM — archive is
// always a soft delete so we can rehydrate data-room evidence, SVI history,
// and shareholder records if a founder changes their mind.
//
// Ownership: enforced by re-fetching the project via getProjectById() and
// checking project.userId === user.id — the same helper used by the sibling
// /api/projects/[id] PATCH/DELETE handlers. Do not add a bespoke RLS bypass
// here; reuse the existing pattern.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectById,
  archiveProject,
  unarchiveProject,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

// POST /api/projects/[id]/archive — soft-delete (set archived_at = now())
export async function POST(
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

  const project = await getProjectById(id);
  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Project not found" },
      { status: 404 },
    );
  }
  if (project.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  // Idempotent — already archived is not an error.
  if (project.archivedAt) {
    return NextResponse.json({
      ok: true,
      project: { id: project.id, archived_at: project.archivedAt },
    });
  }

  const result = await archiveProject(id);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 422 },
    );
  }

  const updated = await getProjectById(id);
  return NextResponse.json({
    ok: true,
    project: { id, archived_at: updated?.archivedAt ?? new Date().toISOString() },
  });
}

// DELETE /api/projects/[id]/archive — unarchive (clear archived_at)
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

  const project = await getProjectById(id);
  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Project not found" },
      { status: 404 },
    );
  }
  if (project.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  // Idempotent — already active is not an error.
  if (!project.archivedAt) {
    return NextResponse.json({
      ok: true,
      project: { id: project.id, archived_at: null },
    });
  }

  const result = await unarchiveProject(id, user.id, user.plan ?? "free");
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    project: { id, archived_at: null },
  });
}
