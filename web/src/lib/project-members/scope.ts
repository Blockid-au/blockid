// Project team-member scoping helpers (server-only).
//
// Q4 Multi-project #3 (iteration-13 T4). Adds shared collaborators on top
// of the existing owner-only projects.user_id model. Every mutation lands
// through a service-role client (RLS on project_members is default-deny
// for writes) but ownership is re-verified in code — see
// assertProjectOwner() — mirroring the pattern used by
// /api/projects/[id]/archive.

import "server-only";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectMemberRole = "viewer" | "editor" | "admin";
export type ProjectMemberStatus = "invited" | "accepted" | "revoked";

export interface ProjectMember {
  id: string;
  projectId: string;
  userEmail: string;
  userId: string | null;
  role: ProjectMemberRole;
  status: ProjectMemberStatus;
  invitedBy: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  token: string;
}

export class ProjectMemberScopeError extends Error {
  constructor(
    msg: string,
    public code:
      | "not_owner"
      | "not_found"
      | "invalid_token"
      | "already_accepted"
      | "revoked"
      | "service_unavailable"
      | "duplicate"
      | "invalid_role"
      | "forbidden" = "not_owner",
  ) {
    super(msg);
    this.name = "ProjectMemberScopeError";
  }
}

export type ProjectPermission = "read" | "write" | "admin";

const VALID_ROLES: ProjectMemberRole[] = ["viewer", "editor", "admin"];

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapMember(row: any): ProjectMember {
  return {
    id: row.id,
    projectId: row.project_id,
    userEmail: row.user_email,
    userId: row.user_id ?? null,
    role: row.role as ProjectMemberRole,
    status: row.status as ProjectMemberStatus,
    invitedBy: row.invited_by ?? null,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at ?? null,
    revokedAt: row.revoked_at ?? null,
    token: row.token,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Ownership guard
// ---------------------------------------------------------------------------

/**
 * Throws ProjectMemberScopeError("not_owner"|"not_found") if the caller
 * does not own the project. Otherwise returns silently.
 */
export async function assertProjectOwner(
  projectId: string,
  userId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ProjectMemberScopeError(
      "supabase not configured",
      "service_unavailable",
    );
  }

  const { data, error } = await supabase
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new ProjectMemberScopeError(
      `assertProjectOwner query failed: ${error.message}`,
      "service_unavailable",
    );
  }
  if (!data) {
    throw new ProjectMemberScopeError("project not found", "not_found");
  }
  if (data.user_id !== userId) {
    throw new ProjectMemberScopeError(
      "caller is not the project owner",
      "not_owner",
    );
  }
}

// ---------------------------------------------------------------------------
// Member-aware permission guard
// ---------------------------------------------------------------------------

/**
 * Role → allowed permissions map. Only applies to `accepted` member rows.
 *
 * - admin   → read + write + admin (can invite/revoke, mutate, view)
 * - editor  → read + write         (can mutate but NOT invite/revoke)
 * - viewer  → read only
 *
 * Any other status (invited, revoked) yields an empty set — the invite
 * has not been consumed (or has been rescinded), so no access flows
 * through this guard until the invitee accepts.
 */
const ROLE_PERMS: Record<ProjectMemberRole, Set<ProjectPermission>> = {
  admin: new Set<ProjectPermission>(["read", "write", "admin"]),
  editor: new Set<ProjectPermission>(["read", "write"]),
  viewer: new Set<ProjectPermission>(["read"]),
};

/**
 * Assert the caller has the given permission on a project.
 *
 * Primary path: ownership check. The project owner always has every
 * permission — this preserves the existing owner-only fallback and must
 * remain the first branch so a mis-configured members row can never lock
 * an owner out of their own project.
 *
 * Secondary path: accepted project_members row lookup. The row's role is
 * mapped through ROLE_PERMS and the requested permission checked against
 * the resulting set. `invited` and `revoked` rows contribute no access.
 *
 * Rejection: throws ProjectMemberScopeError with `code: "forbidden"`.
 * Missing project throws `not_found`; supabase misconfiguration throws
 * `service_unavailable`.
 */
export async function assertProjectMemberCan(
  projectId: string,
  userId: string,
  perm: ProjectPermission,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ProjectMemberScopeError(
      "supabase not configured",
      "service_unavailable",
    );
  }

  // ── Primary path: owner always wins ─────────────────────────────────
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectErr) {
    throw new ProjectMemberScopeError(
      `assertProjectMemberCan project lookup failed: ${projectErr.message}`,
      "service_unavailable",
    );
  }
  if (!project) {
    throw new ProjectMemberScopeError("project not found", "not_found");
  }
  if (project.user_id === userId) {
    // Owner has every permission — read + write + admin.
    return;
  }

  // ── Secondary path: accepted member row ─────────────────────────────
  const { data: member, error: memberErr } = await supabase
    .from("project_members")
    .select("role,status")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("status", "accepted")
    .maybeSingle();

  if (memberErr) {
    throw new ProjectMemberScopeError(
      `assertProjectMemberCan member lookup failed: ${memberErr.message}`,
      "service_unavailable",
    );
  }
  if (!member) {
    throw new ProjectMemberScopeError(
      `caller ${userId} has no accepted membership on project ${projectId}`,
      "forbidden",
    );
  }

  const role = member.role as ProjectMemberRole;
  const allowed = ROLE_PERMS[role];
  if (!allowed || !allowed.has(perm)) {
    throw new ProjectMemberScopeError(
      `role '${role}' lacks '${perm}' permission on project ${projectId}`,
      "forbidden",
    );
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * List every project_members row for a project, ordered oldest-first.
 * Callers must have already run assertProjectOwner() (owner-only surface).
 */
export async function listMembers(projectId: string): Promise<ProjectMember[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ProjectMemberScopeError(
      "supabase not configured",
      "service_unavailable",
    );
  }

  const { data, error } = await supabase
    .from("project_members")
    .select("*")
    .eq("project_id", projectId)
    .order("invited_at", { ascending: true });

  if (error) {
    throw new ProjectMemberScopeError(
      `listMembers failed: ${error.message}`,
      "service_unavailable",
    );
  }
  return (data ?? []).map(mapMember);
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

/**
 * Create a new invite row on a project. Returns the persisted member
 * (including the one-time `token` — surface it to the owner as a
 * shareable /invites/[token] URL).
 *
 * Ownership must be pre-verified by the caller.
 */
export async function inviteMember(
  projectId: string,
  email: string,
  role: ProjectMemberRole,
  invitedBy: string,
): Promise<ProjectMember> {
  if (!VALID_ROLES.includes(role)) {
    throw new ProjectMemberScopeError(
      `invalid role: ${role}`,
      "invalid_role",
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ProjectMemberScopeError(
      "supabase not configured",
      "service_unavailable",
    );
  }

  const cleanEmail = normaliseEmail(email);
  const token = randomBytes(32).toString("hex");

  // If invitee already has an app_users row we attach user_id up-front so
  // the accepted-members RLS policy applies immediately after they hit
  // Accept. Missing row is fine — accept flow resolves it lazily.
  const { data: existingUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", cleanEmail)
    .maybeSingle();

  const { data, error } = await supabase
    .from("project_members")
    .insert({
      project_id: projectId,
      user_email: cleanEmail,
      user_id: existingUser?.id ?? null,
      role,
      status: "invited",
      invited_by: invitedBy,
      token,
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = unique_violation on (project_id, user_email)
    if (error.code === "23505") {
      throw new ProjectMemberScopeError(
        "that email is already a member of this project",
        "duplicate",
      );
    }
    throw new ProjectMemberScopeError(
      `inviteMember failed: ${error.message}`,
      "service_unavailable",
    );
  }

  return mapMember(data);
}

// ---------------------------------------------------------------------------
// Accept
// ---------------------------------------------------------------------------

/**
 * Consume an invite token. Marks the row as accepted and pins user_id.
 * Throws when the token is unknown, already accepted, or revoked.
 */
export async function acceptInvite(
  token: string,
  userId: string,
): Promise<ProjectMember> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ProjectMemberScopeError(
      "supabase not configured",
      "service_unavailable",
    );
  }

  const { data: existing, error: readErr } = await supabase
    .from("project_members")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (readErr) {
    throw new ProjectMemberScopeError(
      `acceptInvite lookup failed: ${readErr.message}`,
      "service_unavailable",
    );
  }
  if (!existing) {
    throw new ProjectMemberScopeError("invite not found", "invalid_token");
  }
  if (existing.status === "accepted") {
    throw new ProjectMemberScopeError(
      "invite already accepted",
      "already_accepted",
    );
  }
  if (existing.status === "revoked") {
    throw new ProjectMemberScopeError("invite has been revoked", "revoked");
  }

  const { data, error } = await supabase
    .from("project_members")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      user_id: userId,
    })
    .eq("id", existing.id)
    .eq("status", "invited") // guard against races
    .select("*")
    .single();

  if (error || !data) {
    throw new ProjectMemberScopeError(
      `acceptInvite update failed: ${error?.message ?? "no row"}`,
      "service_unavailable",
    );
  }

  return mapMember(data);
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

/**
 * Revoke a member. Only the project owner may revoke. Idempotent — a
 * second call on an already-revoked row still returns ok:true and does
 * not touch the timestamp.
 */
export async function revokeMember(
  memberId: string,
  requesterUserId: string,
): Promise<ProjectMember> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ProjectMemberScopeError(
      "supabase not configured",
      "service_unavailable",
    );
  }

  const { data: existing, error: readErr } = await supabase
    .from("project_members")
    .select("*")
    .eq("id", memberId)
    .maybeSingle();

  if (readErr) {
    throw new ProjectMemberScopeError(
      `revokeMember lookup failed: ${readErr.message}`,
      "service_unavailable",
    );
  }
  if (!existing) {
    throw new ProjectMemberScopeError("member not found", "not_found");
  }

  // Admin-perm check — owner OR accepted admin members may revoke. This
  // is the same guard mounted on the /members POST + DELETE routes, so
  // "admin" here means the caller can invite AND revoke collaborators.
  // Editors/viewers/non-members are rejected with `forbidden`; a missing
  // project surfaces `not_found` from assertProjectMemberCan.
  await assertProjectMemberCan(
    existing.project_id as string,
    requesterUserId,
    "admin",
  );

  if (existing.status === "revoked") {
    return mapMember(existing); // idempotent no-op
  }

  const { data, error } = await supabase
    .from("project_members")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("id", memberId)
    .select("*")
    .single();

  if (error || !data) {
    throw new ProjectMemberScopeError(
      `revokeMember update failed: ${error?.message ?? "no row"}`,
      "service_unavailable",
    );
  }

  return mapMember(data);
}
