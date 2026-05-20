import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { updateTeamMember, removeMember } from "@/lib/equity";

export const dynamic = "force-dynamic";

// Helper: verify the member belongs to a project owned by the current user
async function verifyMemberOwnership(
  memberId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database not configured", status: 500 };

  const { data: member } = await supabase
    .from("team_members")
    .select("id, project_id")
    .eq("id", memberId)
    .maybeSingle();

  if (!member) {
    return { ok: false, error: "Member not found", status: 404 };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", member.project_id)
    .maybeSingle();

  if (!project || project.user_id !== userId) {
    return { ok: false, error: "Not authorized", status: 403 };
  }

  return { ok: true };
}

// PATCH /api/equity/[id] — update a team member
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

  const ownership = await verifyMemberOwnership(id, user.id);
  if (!ownership.ok) {
    return NextResponse.json(
      { ok: false, error: ownership.error },
      { status: ownership.status ?? 403 },
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

  const { name, email, role, equityPct, vestingMonths, cliffMonths, vestingStartDate } =
    (body as {
      name?: string;
      email?: string;
      role?: string;
      equityPct?: number;
      vestingMonths?: number | null;
      cliffMonths?: number | null;
      vestingStartDate?: string | null;
    }) ?? {};

  if (equityPct !== undefined && (typeof equityPct !== "number" || equityPct < 0 || equityPct > 100)) {
    return NextResponse.json(
      { ok: false, error: "equityPct must be between 0 and 100" },
      { status: 400 },
    );
  }

  const result = await updateTeamMember(id, {
    name,
    email,
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

  return NextResponse.json({ ok: true });
}

// DELETE /api/equity/[id] — soft-delete a team member
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

  const ownership = await verifyMemberOwnership(id, user.id);
  if (!ownership.ok) {
    return NextResponse.json(
      { ok: false, error: ownership.error },
      { status: ownership.status ?? 403 },
    );
  }

  const result = await removeMember(id);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true });
}
