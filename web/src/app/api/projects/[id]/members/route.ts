// Project members API — Q4 Multi-project #3 (iteration-13 T4).
//
// Owner-only surface for managing project_members rows. The invitee-facing
// half of the flow lives at /api/projects/members/accept (POST).
//
// GET    /api/projects/[id]/members            → list all members
// POST   /api/projects/[id]/members            → invite {email, role}
// DELETE /api/projects/[id]/members?memberId=… → revoke that member
//
// Access is enforced by assertProjectAccess(…, "admin") from lib/projects —
// owner OR an accepted admin member — for GET, POST and DELETE alike
// (S17-A), so one chokepoint covers reads and writes.
//
// S17-A review (P2-3): a NON-member gets 404 (same as a missing project),
// never 403 — the older assertProjectMemberCan() answered 403 for
// "exists but you are not a member", which let anyone probe project ids.
// Only an accepted member whose role is below admin sees 403.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";
import {
  listMembers,
  inviteMember,
  revokeMember,
  ProjectMemberScopeError,
  type ProjectMemberRole,
} from "@/lib/project-members/scope";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";
import { apiRoute } from "@/lib/audit/api-route";
import { absoluteSiteUrl } from "@/lib/site-url";
import { auditNote, setAuditProject } from "@/lib/audit/context";

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

// Release QA-2 F3: the invite link must be the canonical public URL. The
// old `new URL(request.url).origin` was the upstream bind address behind
// nginx (`https://0.0.0.0:4001/invites/…`) and shipped to founders as
// "Copy link". Never derive user-facing absolute URLs from request.url.
function inviteUrlFor(token: string): string {
  return absoluteSiteUrl(`/invites/${encodeURIComponent(token)}`);
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
    // S17-A: owner OR accepted admin member may read the roster — the same
    // guard the invite/revoke handlers use, so an admin co-founder sees who
    // they can manage. Non-member → 404 (P2-3).
    await assertProjectAccess(user.id, id, "admin");
    const members = await listMembers(id);
    return NextResponse.json({ ok: true, members });
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
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

async function POST_handler(
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
    // Editors/viewers get 403; non-members 404 (P2-3); inviting new
    // collaborators is admin-level.
    const access = await assertProjectAccess(user.id, id, "admin");
    // Release QA-2 F6: assertProjectAccess() (unlike getProjectScope()) does
    // not annotate the audit context, so `project.member.invited` rows
    // carried project_id NULL and were invisible in the project-scoped log.
    setAuditProject({ projectId: id, role: access.role, userId: user.id });
    const member = await inviteMember(id, email, role, user.id);
    auditNote(member.id, { role: member.role });

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
      invite_url: inviteUrlFor(member.token),
    });
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
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
    // Missing project AND non-member both 404 (P2-3).
    await assertProjectAccess(user.id, projectId, "admin");
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
    const denied = projectAccessResponse(err);
    if (denied) return denied;
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

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/projects/[id]/members/route.ts", method: "POST" }, POST_handler);
export const DELETE = apiRoute({ route: "api/projects/[id]/members/route.ts", method: "DELETE" }, DELETE_handler);
