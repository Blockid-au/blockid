import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserProjects, createProject, getProjectLimit } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET /api/projects — list user's projects
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const projects = await getUserProjects(user.id);
  const limit = getProjectLimit(user.plan ?? "free");

  return NextResponse.json({
    ok: true,
    projects,
    limit,
    used: projects.length,
  });
}

// POST /api/projects — create a new project
// Body: { name: string, description?: string, industry?: string }
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

  const { name, description, industry } = (body as {
    name?: string;
    description?: string;
    industry?: string;
  }) ?? {};

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "Project name is required" },
      { status: 400 },
    );
  }

  if (name.trim().length > 100) {
    return NextResponse.json(
      { ok: false, error: "Project name must be under 100 characters" },
      { status: 400 },
    );
  }

  const result = await createProject(user.id, name, user.plan ?? "free", {
    description: description as string | undefined,
    industry: industry as string | undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true, project: result.project }, { status: 201 });
}
