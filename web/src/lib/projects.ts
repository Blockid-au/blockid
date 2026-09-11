// Multi-project management (server-only).
//
// Enables users to manage multiple startup projects within a single
// BlockID account. Each project gets independent SVI scoring, evidence,
// and tracking. Credits remain shared at the user level (one wallet).

import "server-only";
import { getSupabaseAdmin } from "./supabase";
import { getPlanCached } from "./plans-db";
import { LEGACY_PLAN_MAP } from "./plans";
import { canCreateAnotherStartup } from "./plans/startup-limit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  industry: string | null;
  stage: number;
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  growth_phase_current: string | null;
  githubUrl?: string | null;
  /**
   * S17-A — the caller's role on this project. `"owner"` for
   * `projects.user_id === callerId`; otherwise the accepted
   * `project_members.role`. Populated by the member-aware readers
   * (`listProjects`, `getActiveProject`, `getProject`); absent on
   * unscoped reads such as `getProjectById`.
   */
  role?: ProjectRole;
  /** True when the caller is an accepted member rather than the owner. */
  isShared?: boolean;
}

// ---------------------------------------------------------------------------
// Project-level permissions (S17-A)
//
// Owner (projects.user_id) is authoritative and behaves as `admin`. Accepted
// `project_members` rows layer viewer < editor < admin on top. `invited` and
// `revoked` rows grant nothing.
// ---------------------------------------------------------------------------

export type ProjectMemberRole = "viewer" | "editor" | "admin";
export type ProjectRole = ProjectMemberRole | "owner";

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

/** True when `role` satisfies `minRole` (owner ≥ admin ≥ editor ≥ viewer). */
export function roleAtLeast(role: ProjectRole, minRole: ProjectMemberRole): boolean {
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK[minRole];
}

/** Role helpers for UI + routes: can the role mutate / administer? */
export function roleCanWrite(role: ProjectRole | null | undefined): boolean {
  return Boolean(role) && roleAtLeast(role as ProjectRole, "editor");
}
export function roleCanAdmin(role: ProjectRole | null | undefined): boolean {
  return Boolean(role) && roleAtLeast(role as ProjectRole, "admin");
}

export class ProjectAccessError extends Error {
  constructor(
    msg: string,
    public code: "not_found" | "forbidden" | "service_unavailable",
  ) {
    super(msg);
    this.name = "ProjectAccessError";
  }
  /** HTTP status a route should answer with. */
  get status(): number {
    return this.code === "not_found" ? 404 : this.code === "forbidden" ? 403 : 503;
  }
}

export interface ProjectAccess {
  project: Project;
  role: ProjectRole;
  isOwner: boolean;
  ownerUserId: string;
}

/**
 * Request-scoped project context for API routes (cookie `blockid_project`
 * → active project, member-aware). `dataEmail` is the OWNER's email — the
 * key every svi_accounts / svi_analyses row is stored under — so a
 * co-founder reads and writes the same startup record as the owner.
 * Credits stay per-user: spend against `userId`, never the owner.
 */
export interface ProjectScope {
  projectId: string;
  project: Project;
  role: ProjectRole;
  isOwner: boolean;
  userId: string;
  email: string;
  dataEmail: string;
  ownerUserId: string;
}

/**
 * Copy shown next to a credit cost when a shared-project member runs a paid
 * report — makes explicit that the member's OWN wallet is charged.
 */
export function creditChargeNote(scope: Pick<ProjectScope, "isOwner"> | null | undefined): string {
  return !scope || scope.isOwner
    ? "Charged to your credits."
    : "Charged to your own credits — not the project owner's.";
}

// ---------------------------------------------------------------------------
// Plan-based project limits
//
// Sourced from plans.usage_limits.profiles (plans.csv → plans table).
// Legacy plan IDs are mapped to v2 IDs via LEGACY_PLAN_MAP before lookup so
// grandfathered subscriptions continue to resolve.
// ---------------------------------------------------------------------------

const UNLIMITED_PROJECTS = Number.MAX_SAFE_INTEGER;

// Static fallback in case the plans row is missing (fresh dev DB / migration
// gap). Values mirror plans.csv → usage_limits.profiles, keyed by both legacy
// and v2 IDs. G12-7 (2026-09-10, T0268/T0269): the Evaluator rungs (Scout /
// Firm / Program — an evaluator creates the startups they evaluate, so
// 25 / 50 / 200) and the accelerator cohort SKUs are listed too — before this
// an evaluator whose plans row failed to load was capped at 1 startup.
const FALLBACK_PROJECT_LIMITS: Record<string, number> = {
  founder_free: 1,
  founder_starter: 1,
  founder_growth: 3,
  founder_scale: 10,
  founder_enterprise: UNLIMITED_PROJECTS,
  investor_angel: 25,
  investor_advisor: 50,
  investor_vc_small: 200,
  investor_vc_ent: UNLIMITED_PROJECTS,
  accelerator_starter: 25,
  accelerator_growth: 100,
  accelerator_enterprise: UNLIMITED_PROJECTS,
  free: 1,
  founding50: 1,
  founder: 3,
  growth: 3,
  growth_annual: 3,
  unlimited: UNLIMITED_PROJECTS,
};

function resolvePlanId(planId: string | null | undefined): string {
  if (!planId) return "founder_free";
  return LEGACY_PLAN_MAP[planId]?.id ?? planId;
}

export async function getProjectLimit(plan: string | null | undefined): Promise<number> {
  const resolved = resolvePlanId(plan);
  try {
    const row = await getPlanCached(resolved);
    const raw = row?.usage_limits?.profiles;
    if (typeof raw === "number") {
      return raw < 0 ? UNLIMITED_PROJECTS : raw;
    }
  } catch {
    // fall through to static fallback
  }
  return FALLBACK_PROJECT_LIMITS[resolved] ?? FALLBACK_PROJECT_LIMITS[plan ?? ""] ?? 1;
}

// ---------------------------------------------------------------------------
// Row → Project mapper
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapProject(row: any, role?: ProjectRole): Project {
  return {
    ...(role ? { role, isShared: role !== "owner" } : {}),
    id: row.id,
    userId: row.user_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    industry: row.industry ?? null,
    stage: row.stage ?? 0,
    isDefault: row.is_default ?? false,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    growth_phase_current: row.growth_phase_current ?? null,
    githubUrl: row.github_url ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Slug generation — URL-friendly, deduplication via suffix
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "project";
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/** List all non-archived projects for a user, ordered by creation date. */
export async function getUserProjects(userId: string): Promise<Project[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[blockid:projects] getUserProjects failed", error);
    return [];
  }

  return (data ?? []).map((row) => mapProject(row, "owner"));
}

/**
 * Accepted memberships for a user → `{ projectId → role }`.
 * Returns an empty map on error or when the table is unreachable so callers
 * degrade to owner-only behaviour rather than failing.
 */
async function getAcceptedMemberships(
  userId: string,
): Promise<Map<string, ProjectMemberRole>> {
  const supabase = getSupabaseAdmin();
  const out = new Map<string, ProjectMemberRole>();
  if (!supabase) return out;

  const { data, error } = await supabase
    .from("project_members")
    .select("project_id, role")
    .eq("user_id", userId)
    .eq("status", "accepted");

  if (error) {
    console.error("[blockid:projects] getAcceptedMemberships failed", error);
    return out;
  }
  for (const row of data ?? []) {
    const role = row.role as ProjectMemberRole;
    if (role === "viewer" || role === "editor" || role === "admin") {
      out.set(row.project_id as string, role);
    }
  }
  return out;
}

/**
 * S17-A — list every non-archived project the user can open: owned ∪
 * accepted memberships. Owned projects come first (creation order), then
 * shared ones. Each row carries `role` / `isShared`.
 *
 * Plan quotas still count owned projects only (`getUserProjects`).
 */
export async function listProjects(userId: string): Promise<Project[]> {
  const owned = await getUserProjects(userId);
  const memberships = await getAcceptedMemberships(userId);
  if (memberships.size === 0) return owned;

  const supabase = getSupabaseAdmin();
  if (!supabase) return owned;

  const ownedIds = new Set(owned.map((p) => p.id));
  const ids = [...memberships.keys()].filter((id) => !ownedIds.has(id));
  if (ids.length === 0) return owned;

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .in("id", ids)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[blockid:projects] listProjects (shared) failed", error);
    return owned;
  }

  const shared = (data ?? []).map((row) =>
    mapProject(row, memberships.get(row.id as string) ?? "viewer"),
  );
  return [...owned, ...shared];
}

/**
 * S17-A — resolve a project by id for a caller, member-aware. Returns the
 * project with `role` when the caller owns it or holds an accepted
 * membership; `null` otherwise (non-members cannot tell it exists).
 */
export async function getProject(
  userId: string,
  projectId: string,
): Promise<Project | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    console.error("[blockid:projects] getProject failed", error);
    return null;
  }
  if (!data) return null;
  if (data.user_id === userId) return mapProject(data, "owner");

  const { data: member } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("status", "accepted")
    .maybeSingle();

  const role = member?.role as ProjectMemberRole | undefined;
  if (role !== "viewer" && role !== "editor" && role !== "admin") return null;
  return mapProject(data, role);
}

/**
 * S17-A — single access chokepoint for project-scoped routes.
 *
 * Owner always passes (as `owner`, which ranks above `admin`). Accepted
 * members pass when their role ≥ `minRole`. Throws `ProjectAccessError`:
 *   - `not_found`  → project missing OR caller is not a member (404 — a
 *                    non-member must not learn the project exists)
 *   - `forbidden`  → member whose role is below `minRole` (403)
 *   - `service_unavailable` → supabase not configured (503)
 */
export async function assertProjectAccess(
  userId: string,
  projectId: string,
  minRole: ProjectMemberRole = "viewer",
): Promise<ProjectAccess> {
  if (!getSupabaseAdmin()) {
    throw new ProjectAccessError("supabase not configured", "service_unavailable");
  }
  const project = await getProject(userId, projectId);
  if (!project || !project.role) {
    throw new ProjectAccessError("project not found", "not_found");
  }
  if (!roleAtLeast(project.role, minRole)) {
    throw new ProjectAccessError(
      `role '${project.role}' is below '${minRole}' on project ${projectId}`,
      "forbidden",
    );
  }
  return {
    project,
    role: project.role,
    isOwner: project.role === "owner",
    ownerUserId: project.userId,
  };
}

/**
 * Owner email for a project (the key SVI data is stored under). Returns
 * `null` when the project or owner row is missing.
 */
async function getProjectOwnerEmail(projectId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data: proj } = await supabase
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!proj?.user_id) return null;
  const { data: owner } = await supabase
    .from("app_users")
    .select("email")
    .eq("id", proj.user_id as string)
    .maybeSingle();
  const email = owner?.email as string | undefined;
  return email ? email.toLowerCase() : null;
}

/**
 * Resolve the email SVI data for `projectId` is keyed under. For the owner
 * this is their own email. For an accepted member it is the owner's email,
 * so the member sees and edits the same startup record.
 */
export async function resolveProjectDataEmail(
  callerEmail: string,
  projectId: string | null,
): Promise<string> {
  if (!projectId) return callerEmail;
  const ownerEmail = await getProjectOwnerEmail(projectId);
  if (!ownerEmail || ownerEmail === callerEmail.toLowerCase()) return callerEmail;
  return ownerEmail;
}

/**
 * List archived projects for a user, ordered by archive date (most recent first).
 *
 * Used by the /workspace/projects "Archived" tab so founders can inspect
 * (and optionally restore) previously archived startups.
 */
export async function getUserArchivedProjects(userId: string): Promise<Project[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) {
    console.error("[blockid:projects] getUserArchivedProjects failed", error);
    return [];
  }

  return (data ?? []).map((row) => mapProject(row, "owner"));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cookie value the switcher / invite-accept write for a project. Slugs are
 * only unique per OWNER (`UNIQUE(user_id, slug)` — most projects are
 * "default"), so a shared project is addressed by its id to avoid being
 * shadowed by the member's own project of the same slug.
 */
export function projectCookieValue(project: Pick<Project, "id" | "slug" | "isShared">): string {
  return project.isShared ? project.id : project.slug;
}

/**
 * Get the active project for a user.
 * If `slug` is provided, find by slug — or by id when it is a UUID (S17-A:
 * that is how shared projects are addressed). Otherwise return the default
 * project.
 */
export async function getActiveProject(
  userId: string,
  slug?: string,
): Promise<Project | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const keyCol = slug && UUID_RE.test(slug) ? "id" : "slug";

  let query = supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null);

  if (slug) {
    query = query.eq(keyCol, slug);
  } else {
    query = query.eq("is_default", true);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[blockid:projects] getActiveProject failed", error);
    return null;
  }
  if (data) return mapProject(data, "owner");

  // S17-A — not an owned project: fall through to accepted memberships.
  // With a slug: the shared project whose slug matches. Without one (no
  // owned default): the first shared project, so an invited co-founder
  // who never created a startup still lands somewhere useful.
  const memberships = await getAcceptedMemberships(userId);
  if (memberships.size === 0) return null;

  let shared = supabase
    .from("projects")
    .select("*")
    .in("id", [...memberships.keys()])
    .is("archived_at", null);
  if (slug) shared = shared.eq(keyCol, slug);

  const { data: sharedRow, error: sharedErr } = await shared
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (sharedErr) {
    console.error("[blockid:projects] getActiveProject (shared) failed", sharedErr);
    return null;
  }
  if (!sharedRow) return null;
  return mapProject(sharedRow, memberships.get(sharedRow.id as string) ?? "viewer");
}

/**
 * Return true when the currently-active project (per the request's
 * `blockid_project` cookie) has `reseller_sandbox_id` set — i.e. it was
 * provisioned as a reseller sandbox workspace via
 * `/api/reseller/sandbox/setup`.
 *
 * Used by server layouts / pages to decide whether to render the
 * `SandboxBanner` at the top of the workspace shell (CLO D4-CLO-06).
 *
 * Falls back to `false` for unauthenticated users, users with no active
 * project, or when the Supabase admin client isn't configured — the banner
 * fails safe (hidden) rather than raising false alarms.
 */
export async function getCurrentProjectIsSandbox(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    const { getCurrentUser } = await import("@/lib/auth");
    const store = await cookies();
    const slug = store.get("blockid_project")?.value;
    const user = await getCurrentUser();
    if (!user) return false;

    const supabase = getSupabaseAdmin();
    if (!supabase) return false;

    // Member-aware (S17-A): resolve the active project the same way every
    // route does, then read the sandbox marker off that row.
    const project = await getActiveProject(user.id, slug);
    if (!project) return false;

    const { data } = await supabase
      .from("projects")
      .select("reseller_sandbox_id")
      .eq("id", project.id)
      .maybeSingle();
    return Boolean(data?.reseller_sandbox_id);
  } catch {
    return false;
  }
}

/**
 * Get the active project_id from the request cookie.
 * Used by all APIs to scope data to the correct startup.
 * Returns null for unauthenticated requests or users without projects.
 */
export async function getProjectIdFromRequest(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const { getCurrentUser } = await import("@/lib/auth");
    const store = await cookies();
    const slug = store.get("blockid_project")?.value;
    const user = await getCurrentUser();
    if (!user) return null;
    const project = await getActiveProject(user.id, slug);
    return project?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * S17-A — request-scoped project context (cookie `blockid_project`,
 * member-aware). Routes that need the caller's ROLE (to gate writes) or the
 * owner's email (to read the shared startup record) use this instead of
 * `getProjectIdFromRequest()`.
 *
 * Returns `null` when unauthenticated or when no project resolves.
 * Throws `ProjectAccessError("forbidden")` when `minRole` is given and the
 * caller's role is below it — so a viewer hitting a write route gets 403
 * while a non-member (no resolvable project) simply gets `null`.
 */
export async function getProjectScope(
  minRole?: ProjectMemberRole,
): Promise<ProjectScope | null> {
  const { cookies } = await import("next/headers");
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) return null;

  let slug: string | undefined;
  try {
    const store = await cookies();
    slug = store.get("blockid_project")?.value;
  } catch {
    slug = undefined;
  }

  const project = await getActiveProject(user.id, slug);
  if (!project) return null;

  const role: ProjectRole =
    project.role ?? (project.userId === user.id ? "owner" : "viewer");
  if (minRole && !roleAtLeast(role, minRole)) {
    throw new ProjectAccessError(
      `role '${role}' is below '${minRole}' on project ${project.id}`,
      "forbidden",
    );
  }

  const isOwner = role === "owner";
  const dataEmail = isOwner
    ? user.email
    : await resolveProjectDataEmail(user.email, project.id);

  return {
    projectId: project.id,
    project,
    role,
    isOwner,
    userId: user.id,
    email: user.email,
    dataEmail,
    ownerUserId: project.userId,
  };
}

/**
 * Find or create an svi_accounts row scoped to (email, project_id).
 *
 * This is the SINGLE source of truth for resolving an SVI account.
 * All endpoints must use this instead of inline findOrCreateAccount()
 * to prevent cross-startup data leaks.
 *
 * - If project_id is provided → look up by (email, project_id)
 * - If project_id is null → look up by email WHERE project_id IS NULL
 * - If no match → INSERT a new row (separate startup record)
 */
export async function findOrCreateSVIAccount(
  email: string,
  projectId: string | null = null,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const query = supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email);

  if (projectId) {
    query.eq("project_id", projectId);
  } else {
    query.is("project_id", null);
  }

  const { data: existing } = await query.maybeSingle();
  if (existing) return existing.id as string;

  // S17-A — shared project: the caller may be an accepted member whose
  // email differs from the owner's. The startup record is keyed under the
  // OWNER's email, so look that up before creating a split row.
  if (projectId) {
    const dataEmail = await resolveProjectDataEmail(email, projectId);
    if (dataEmail !== email) {
      const { data: ownerRow } = await supabase
        .from("svi_accounts")
        .select("id")
        .eq("email", dataEmail)
        .eq("project_id", projectId)
        .maybeSingle();
      if (ownerRow) return ownerRow.id as string;
      email = dataEmail;
    }
  }

  // Get project name for the startup_name field
  let startupName: string | null = null;
  if (projectId) {
    const { data: proj } = await supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .maybeSingle();
    startupName = (proj?.name as string) ?? null;
  }

  // Create new account for this project
  const { data: created, error } = await supabase
    .from("svi_accounts")
    .insert({
      email,
      project_id: projectId,
      startup_name: startupName,
      last_active_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[blockid:projects] svi_accounts insert failed", error);
    return null;
  }

  // Auto-create founder as 100% shareholder with default share allocation
  // Shares based on estimated valuation: $100K base = 1,000,000 shares at $0.10/share
  const accountId = created.id as string;
  const DEFAULT_TOTAL_SHARES = 1_000_000;
  const founderName = startupName ? `Founder (${startupName})` : "Founder";

  // Create default share class
  const { data: shareClass } = await supabase
    .from("share_classes")
    .insert({
      account_id: accountId,
      name: "Ordinary",
      class_type: "ordinary",
      total_authorized: DEFAULT_TOTAL_SHARES,
      price_per_share: 0.10,
    })
    .select("id")
    .single();

  // Create founder shareholder with 100% of shares
  if (shareClass) {
    await supabase.from("shareholders").insert({
      account_id: accountId,
      name: founderName,
      email,
      role: "founder",
      share_class_id: shareClass.id,
      shares_held: DEFAULT_TOTAL_SHARES,
    });
  }

  return accountId;
}

/**
 * Find an existing SVI account with fallback for legacy records.
 *
 * Old accounts were created before multi-project support and have
 * project_id = NULL. When a user now has an active project, the strict
 * (email, project_id) lookup fails. This helper:
 *
 * 1. Tries exact match: email + project_id
 * 2. If not found AND projectId is not null → falls back to email + project_id IS NULL
 * 3. Auto-migrates the legacy account by setting its project_id
 * 4. Also migrates orphaned svi_analyses records for the same email
 *
 * Returns the full account row or null.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function findSVIAccountWithFallback(
  email: string,
  projectId: string | null,
  selectColumns = "id, email, startup_name, current_svi, current_stage",
): Promise<Record<string, unknown> | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  // 1. Exact match
  const exactQuery = supabase
    .from("svi_accounts")
    .select(selectColumns)
    .eq("email", email);

  if (projectId) {
    exactQuery.eq("project_id", projectId);
  } else {
    exactQuery.is("project_id", null);
  }

  const { data: exact } = await exactQuery
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (exact) return exact as any;

  // 2. Fallback: legacy account with project_id IS NULL
  if (!projectId) return null; // already tried null — nothing to fall back to

  // S17-A — shared project: retry under the owner's email (the key the
  // startup record lives under) before touching the legacy fallback.
  const dataEmail = await resolveProjectDataEmail(email, projectId);
  if (dataEmail !== email) {
    const { data: ownerExact } = await supabase
      .from("svi_accounts")
      .select(selectColumns)
      .eq("email", dataEmail)
      .eq("project_id", projectId)
      .order("last_active_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ownerExact) return ownerExact as any;
    email = dataEmail;
  }

  const { data: legacy } = await supabase
    .from("svi_accounts")
    .select(selectColumns)
    .eq("email", email)
    .is("project_id", null)
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!legacy) return null;

  // Return legacy data read-only — do NOT migrate. Migration would incorrectly
  // assign old analyses to the current project when multiple projects exist.
  return legacy as any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Find latest SVI analysis with fallback for legacy records (project_id NULL).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function findLatestAnalysisWithFallback(
  email: string,
  projectId: string | null,
  selectColumns = "id, raw_input, total_svi, analysis_json",
): Promise<Record<string, unknown> | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const exactQuery = supabase
    .from("svi_analyses")
    .select(selectColumns)
    .eq("email", email);

  if (projectId) {
    exactQuery.eq("project_id", projectId);
  } else {
    exactQuery.is("project_id", null);
  }

  const { data: exact } = await exactQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (exact) return exact as any;

  // Fallback to null project_id
  if (!projectId) return null;

  // S17-A — shared project: retry under the owner's email first.
  const dataEmail = await resolveProjectDataEmail(email, projectId);
  if (dataEmail !== email) {
    const { data: ownerExact } = await supabase
      .from("svi_analyses")
      .select(selectColumns)
      .eq("email", dataEmail)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ownerExact) return ownerExact as any;
    email = dataEmail;
  }

  const { data: legacy } = await supabase
    .from("svi_analyses")
    .select(selectColumns)
    .eq("email", email)
    .is("project_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacy) {
    // Migrate this and other orphaned analyses
    await supabase
      .from("svi_analyses")
      .update({ project_id: projectId })
      .eq("email", email)
      .is("project_id", null);
  }

  return (legacy as any) ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Get a project by its ID. */
export async function getProjectById(projectId: string): Promise<Project | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    console.error("[blockid:projects] getProjectById failed", error);
    return null;
  }
  if (!data) return null;
  return mapProject(data);
}

/**
 * Create a new project. Checks plan limits before inserting.
 * Returns `{ ok, project?, error? }`.
 */
export async function createProject(
  userId: string,
  name: string,
  plan: string,
  opts?: { description?: string; industry?: string; githubUrl?: string },
): Promise<{ ok: boolean; project?: Project; error?: string; reason?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Service unavailable" };

  const existing = await getUserProjects(userId);

  // Founder 1-startup guard (2026-07-24 directive). Read account_type
  // straight from app_users so a legacy AppUser payload without the field
  // still gets checked. Missing rows / DB blip are treated as `founder`
  // so we fail-safe closed.
  const { data: userRow } = await supabase
    .from("app_users")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle();
  const accountType = (userRow?.account_type as string | null | undefined) ?? "founder";

  const decision = canCreateAnotherStartup({
    account_type: accountType,
    current_startup_count: existing.length,
  });
  if (!decision.allowed) {
    return {
      ok: false,
      reason: decision.reason,
      error:
        "Founder accounts can own one startup. Upgrade to Accelerator to manage multiple.",
    };
  }

  // Check plan limit (still applied for multi-startup account types so an
  // accelerator on the smallest tier stops at their cohort seat cap).
  const limit = await getProjectLimit(plan);
  if (existing.length >= limit) {
    return {
      ok: false,
      error: `Your ${plan || "free"} plan allows up to ${limit} startup${limit === 1 ? "" : "s"}. Upgrade to add more.`,
    };
  }

  // Generate unique slug
  let slug = toSlug(name);
  const existingSlugs = new Set(existing.map((p) => p.slug));
  if (existingSlugs.has(slug)) {
    let suffix = 2;
    while (existingSlugs.has(`${slug}-${suffix}`)) suffix++;
    slug = `${slug}-${suffix}`;
  }

  // If user has no projects yet, make this the default
  const isDefault = existing.length === 0;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name: name.trim(),
      slug,
      description: opts?.description?.trim() || null,
      industry: opts?.industry?.trim() || null,
      github_url: opts?.githubUrl?.trim() || null,
      is_default: isDefault,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[blockid:projects] createProject failed", error);
    // Handle unique constraint violation gracefully
    if (error.code === "23505") {
      return { ok: false, error: "A project with that name already exists." };
    }
    return { ok: false, error: "Failed to create project" };
  }

  const project = mapProject(data);

  // Retail reseller attribution — if the founder arrived via a ?via= cookie
  // (processAttribution() stamped app_users.attribution_reseller_id at
  // signup), materialise the per-project reseller_attributions row now that
  // we have a projects.id. Wholesale-provisioned workspaces write this row
  // inside /api/reseller/create-startup and never touch createProject().
  // Failure is non-fatal — a broken attribution write must not prevent
  // retail project creation. See web/src/lib/reseller/retail-attribution.ts
  // for the design rationale (mirrors the CTO-approved wholesale execute()
  // pattern from create-startup/route.ts:299-320).
  try {
    const { attributeProjectFromUserCache } = await import(
      "./reseller/retail-attribution"
    );
    await attributeProjectFromUserCache(userId, project.id);
  } catch (attrErr) {
    console.error("[blockid:projects] retail attribution write threw", attrErr);
  }

  return { ok: true, project };
}

/** Update a project's name, description, industry, or github_url. */
export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, "name" | "description" | "industry" | "githubUrl">>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Service unavailable" };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.industry !== undefined) patch.industry = updates.industry?.trim() || null;
  if (updates.githubUrl !== undefined) patch.github_url = updates.githubUrl?.trim() || null;

  const { error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", projectId);

  if (error) {
    console.error("[blockid:projects] updateProject failed", error);
    return { ok: false, error: "Failed to update project" };
  }

  return { ok: true };
}

/** Soft-delete (archive) a project. Cannot archive the default project. */
export async function archiveProject(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Service unavailable" };

  // Check that it's not the default project
  const { data: project } = await supabase
    .from("projects")
    .select("is_default")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return { ok: false, error: "Project not found" };
  if (project.is_default) return { ok: false, error: "Cannot archive the default project" };

  const { error } = await supabase
    .from("projects")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) {
    console.error("[blockid:projects] archiveProject failed", error);
    return { ok: false, error: "Failed to archive project" };
  }

  return { ok: true };
}

/**
 * Restore an archived project by clearing archived_at.
 *
 * Respects the plan's project limit — a founder cannot unarchive past their
 * quota (they'd have to archive an active project first, or upgrade).
 */
export async function unarchiveProject(
  projectId: string,
  userId: string,
  plan: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Service unavailable" };

  const limit = await getProjectLimit(plan);
  const active = await getUserProjects(userId);
  if (active.length >= limit) {
    return {
      ok: false,
      error: `Your ${plan || "free"} plan allows up to ${limit} active startup${limit === 1 ? "" : "s"}. Archive another startup or upgrade before restoring this one.`,
    };
  }

  const { error } = await supabase
    .from("projects")
    .update({ archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) {
    console.error("[blockid:projects] unarchiveProject failed", error);
    return { ok: false, error: "Failed to restore project" };
  }

  return { ok: true };
}

/**
 * Hard-delete archived projects whose `archived_at` is older than the given
 * retention window (Iteration-18 T1 — Q4 MP #5 90-day retention).
 *
 * SAFETY GUARANTEES:
 * - Skips rows where `archived_at IS NULL` (only archived rows are eligible).
 * - Never throws — returns `{ ok:false, error }` on Supabase failure so the
 *   cron caller can still emit a failure audit row rather than crash silently.
 * - Returns the list of purged `{ id, user_id }` pairs so the caller can emit
 *   one audit row per project preserving the original owning user_id.
 *
 * @param days   Retention window in days (must be > 0).
 */
export async function purgeArchivedOlderThan(
  days: number,
): Promise<
  | { ok: true; count: number; purged: Array<{ id: string; user_id: string }> }
  | { ok: false; error: string }
> {
  if (!Number.isFinite(days) || days <= 0) {
    return { ok: false, error: "days must be a positive number" };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "supabase_not_configured" };

  const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Two-step: SELECT the target rows first so we can return their user_ids
  // for the audit trail, THEN delete by id list. This keeps the audit
  // fan-out independent of any RETURNING support in the underlying client
  // and lets us report an accurate count even when the DELETE is a no-op.
  try {
    const { data: targets, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id")
      .not("archived_at", "is", null)
      .lt("archived_at", cutoffIso);

    if (selErr) {
      console.error("[blockid:projects] purgeArchivedOlderThan select failed", selErr);
      return { ok: false, error: selErr.message };
    }

    const rows = (targets ?? []) as Array<{ id: string; user_id: string }>;
    if (rows.length === 0) {
      return { ok: true, count: 0, purged: [] };
    }

    const ids = rows.map((r) => r.id);
    const { error: delErr } = await supabase
      .from("projects")
      .delete()
      .in("id", ids);

    if (delErr) {
      console.error("[blockid:projects] purgeArchivedOlderThan delete failed", delErr);
      return { ok: false, error: delErr.message };
    }

    return { ok: true, count: rows.length, purged: rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blockid:projects] purgeArchivedOlderThan threw", err);
    return { ok: false, error: message };
  }
}

/**
 * Ensure a user has at least one (default) project.
 * Called lazily when needed — creates a "My Startup" default if none exist.
 */
export async function ensureDefaultProject(
  userId: string,
  startupName?: string,
): Promise<Project | null> {
  const existing = await getUserProjects(userId);
  if (existing.length > 0) {
    return existing.find((p) => p.isDefault) ?? existing[0];
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name: startupName || "My Startup",
      slug: "default",
      is_default: true,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[blockid:projects] ensureDefaultProject failed", error);
    return null;
  }

  return mapProject(data);
}
