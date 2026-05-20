import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectById } from "@/lib/projects";
import { getEquitySummary, addTeamMember } from "@/lib/equity";

export const dynamic = "force-dynamic";

// GET /api/equity?projectId=xxx — get equity summary for a project
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "projectId is required" },
      { status: 400 },
    );
  }

  // Verify ownership
  const project = await getProjectById(projectId);
  if (!project || project.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Project not found" },
      { status: 404 },
    );
  }

  const summary = await getEquitySummary(projectId);
  return NextResponse.json({ ok: true, ...summary });
}

// POST /api/equity — add a team member
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
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

  const { projectId, name, email, role, equityPct, vestingMonths, cliffMonths, vestingStartDate } =
    (body as {
      projectId?: string;
      name?: string;
      email?: string;
      role?: string;
      equityPct?: number;
      vestingMonths?: number;
      cliffMonths?: number;
      vestingStartDate?: string;
    }) ?? {};

  if (!projectId || !name || !role || equityPct === undefined) {
    return NextResponse.json(
      { ok: false, error: "projectId, name, role, and equityPct are required" },
      { status: 400 },
    );
  }

  if (typeof equityPct !== "number" || equityPct < 0 || equityPct > 100) {
    return NextResponse.json(
      { ok: false, error: "equityPct must be between 0 and 100" },
      { status: 400 },
    );
  }

  // Verify ownership
  const project = await getProjectById(projectId);
  if (!project || project.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Project not found" },
      { status: 404 },
    );
  }

  const result = await addTeamMember(projectId, {
    name: name.trim(),
    email: email?.trim(),
    role,
    equityPct,
    vestingMonths,
    cliffMonths,
    vestingStartDate,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true, member: result.member }, { status: 201 });
}
