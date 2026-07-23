// Project members API — Q4 Multi-project #3 (iteration-13 T4).
//
// Owner-only surface for managing project_members rows. The invitee-facing
// half of the flow lives at /api/projects/members/accept (POST).
//
// GET    /api/projects/[id]/members            → list all members
// POST   /api/projects/[id]/members            → invite {email, role}
// DELETE /api/projects/[id]/members?memberId=… → revoke that member
//
// Ownership is enforced by assertProjectOwner() — the same shape used by
// the sibling /archive route (getProjectById + userId compare) delegated
// into the scope helper so a single chokepoint covers reads and writes.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  assertProjectOwner,
  assertProjectMemberCan,
  listMembers,
  inviteMember,
  revokeMember,
  ProjectMemberScopeError,
  type ProjectMemberRole,
} from "@/lib/project-members/scope";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";

// Extract the domain portion of an email for PII-safe audit metadata.
// We NEVER log the full local-part — only the host, or null if malformed.
function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  const host = email.slice(at + 1).trim().toLowerCase();
  return host.length > 0 ? host : null;
}

export const dynamic = "force-dynamic";

const VALID_ROLES: ProjectMemberRole[] = ["viewer", "editor", "admin"];

function inviteUrlFor(request: Request, token: string): string {
  try {
    const origin = new URL(request.url).origin;
    return `${origin}/invites/${token}`;
  } catch {
    return `/invites/${token}`;
  }
}

function scopeErrorToStatus(err: ProjectMemberScopeError): number {
  switch (err.code) {
    case "not_found":
      return 404;
    case "not_owner":
    case "forbidden":
      return 403;
    case "duplicate":
    case "invalid_role":
      return 422;
    case "service_unavailable":
      return 503;
    default:
      return 400;
  }
}

// ---------------------------------------------------------------------------
// GET — list members
// ---------------------------------------------------------------------------

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
    await assertProjectOwner(id, user.id);
    const members = await listMembers(id);
    return NextResponse.json({ ok: true, members });
  } catch (err) {
    if (err instanceof ProjectMemberScopeError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: scopeErrorToStatus(err) },
      );
    }
    console.error("[blockid:project-members] GET failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — invite a member
// ---------------------------------------------------------------------------

export async function POST(
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

  let body: { email?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role =
    typeof body.role === "string" ? (body.role as ProjectMemberRole) : "viewer";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "A valid email address is required" },
      { status: 400 },
    );
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { ok: false, error: `Role must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    // Admin-perm required — owner OR accepted admin members may invite.
    // Editors/viewers get 403; inviting new collaborators is admin-level.
    await assertProjectMemberCan(id, user.id, "admin");
    const member = await inviteMember(id, email, role, user.id);

    // SOC2-lite audit: record the successful invite. Domain only — never
    // the local-part — so PII is preserved.
    await logUserAction({
      userId: user.id,
      action: "project.member.invited",
      subjectType: "project",
      subjectId: id,
      fields: {
        member_id: member.id,
        role: member.role,
        email_domain: emailDomain(member.userEmail),
      },
      route: `/api/projects/${id}/members`,
      ip: extractIp(request.headers),
      ua: extractUserAgent(request.headers),
    });

    return NextResponse.json({
      ok: true,
      member,
      invite_url: inviteUrlFor(request, member.token),
    });
  } catch (err) {
    if (err instanceof ProjectMemberScopeError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: scopeErrorToStatus(err) },
      );
    }
    console.error("[blockid:project-members] POST failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — revoke a member (by ?memberId=)
// ---------------------------------------------------------------------------

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

  const { id: projectId } = await params;
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId");

  if (!memberId) {
    return NextResponse.json(
      { ok: false, error: "memberId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    // Admin-perm required — owner OR accepted admin members may revoke.
    // Also 404s a stale projectId via the internal project lookup.
    await assertProjectMemberCan(projectId, user.id, "admin");
    const member = await revokeMember(memberId, user.id);
    if (member.projectId !== projectId) {
      // Guard against a memberId pointing to a member of a different project.
      return NextResponse.json(
        { ok: false, error: "member does not belong to this project" },
        { status: 400 },
      );
    }

    // SOC2-lite audit: record the successful revoke.
    await logUserAction({
      userId: user.id,
      action: "project.member.revoked",
      subjectType: "project",
      subjectId: projectId,
      fields: {
        member_id: member.id,
        role: member.role,
        email_domain: emailDomain(member.userEmail),
      },
      route: `/api/projects/${projectId}/members`,
      ip: extractIp(request.headers),
      ua: extractUserAgent(request.headers),
    });

    return NextResponse.json({ ok: true, member });
  } catch (err) {
    if (err instanceof ProjectMemberScopeError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: scopeErrorToStatus(err) },
      );
    }
    console.error("[blockid:project-members] DELETE failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
