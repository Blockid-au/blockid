// PATCH /api/projects/[id]/members/[memberId] — change a member role.
//
// S30-B live QA (P2): there was no way to move a collaborator between
// viewer / editor / admin — the only options were revoke (which, until the
// same fix, also made the address un-invitable). Owner OR accepted admin
// member (assertProjectAccess "admin", the same chokepoint as the roster
// routes); a non-member gets 404, an accepted member below admin 403.
//
// The memberId is bound to the route project inside changeMemberRole: a
// member of ANOTHER project answers 404 before any permission check or
// write, so the URL is neither an existence oracle nor a cross-project
// mutation. Audit: project.member.role_changed {member_id, from_role,
// to_role, email_domain}. An admin → editor/viewer downgrade also runs the
// S20-B webhook cascade (the dispatcher only keeps project-level endpoints
// whose creator is the owner or an accepted admin).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";
import {
  changeMemberRole,
  ProjectMemberScopeError,
  type ProjectMemberRole,
} from "@/lib/project-members/scope";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";
import { apiRoute } from "@/lib/audit/api-route";
import { auditNote, setAuditProject } from "@/lib/audit/context";

export const dynamic = "force-dynamic";

const VALID_ROLES: ProjectMemberRole[] = ["viewer", "editor", "admin"];

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  const host = email.slice(at + 1).trim().toLowerCase();
  return host.length > 0 ? host : null;
}

function scopeErrorToStatus(err: ProjectMemberScopeError): number {
  switch (err.code) {
    case "not_found":
      return 404;
    case "not_owner":
    case "forbidden":
      return 403;
    case "invalid_role":
      return 422;
    case "revoked":
      return 409;
    case "service_unavailable":
      return 503;
    default:
      return 400;
  }
}

async function PATCH_handler(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const { id: projectId, memberId } = await params;

  let body: { role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const role = typeof body.role === "string" ? (body.role as ProjectMemberRole) : null;
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { ok: false, error: `Role must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const access = await assertProjectAccess(user.id, projectId, "admin");
    setAuditProject({ projectId, role: access.role, userId: user.id });
    const { member, previousRole, deactivatedEndpoints } = await changeMemberRole(
      projectId,
      memberId,
      role,
      user.id,
    );
    auditNote(member.id, { from_role: previousRole, to_role: member.role });

    if (previousRole !== member.role) {
      await logUserAction({
        userId: user.id,
        action: "project.member.role_changed",
        subjectType: "project",
        subjectId: projectId,
        fields: {
          member_id: member.id,
          from_role: previousRole,
          to_role: member.role,
          email_domain: emailDomain(member.userEmail),
          webhook_endpoints_deactivated: deactivatedEndpoints.length,
        },
        route: `/api/projects/${projectId}/members/${memberId}`,
        ip: extractIp(request.headers),
        ua: extractUserAgent(request.headers),
      });
    }

    return NextResponse.json({
      ok: true,
      member,
      previousRole,
      webhookEndpointsDeactivated: deactivatedEndpoints,
    });
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
    if (err instanceof ProjectMemberScopeError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        { status: scopeErrorToStatus(err) },
      );
    }
    console.error("[blockid:project-members] PATCH failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/projects/[id]/members/[memberId]/route.ts", method: "PATCH" }, PATCH_handler);
