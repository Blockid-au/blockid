// Multi-project management (server-only).
//
// Enables users to manage multiple startup projects within a single
// BlockID account. Each project gets independent SVI scoring, evidence,
// and tracking. Credits remain shared at the user level (one wallet).

import "server-only";
import { getSupabaseAdmin } from "./supabase";

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
}

// ---------------------------------------------------------------------------
// Plan-based project limits
// ---------------------------------------------------------------------------

const PLAN_PROJECT_LIMITS: Record<string, number> = {
  free: 1,
  founding50: 3,
  founder: 3,
  growth: 10,
  unlimited: 999,
};

export function getProjectLimit(plan: string): number {
  return PLAN_PROJECT_LIMITS[plan] ?? 1;
}

// ---------------------------------------------------------------------------
// Row → Project mapper
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapProject(row: any): Project {
  return {
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

  return (data ?? []).map(mapProject);
}

/**
 * Get the active project for a user.
 * If `slug` is provided, find by slug. Otherwise return the default project.
 */
export async function getActiveProject(
  userId: string,
  slug?: string,
): Promise<Project | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  let query = supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null);

  if (slug) {
    query = query.eq("slug", slug);
  } else {
    query = query.eq("is_default", true);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[blockid:projects] getActiveProject failed", error);
    return null;
  }
  if (!data) return null;
  return mapProject(data);
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

  // Create new account for this project
  const { data: created, error } = await supabase
    .from("svi_accounts")
    .insert({
      email,
      project_id: projectId,
      last_active_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[blockid:projects] svi_accounts insert failed", error);
    return null;
  }
  return created.id as string;
}

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
  opts?: { description?: string; industry?: string },
): Promise<{ ok: boolean; project?: Project; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Service unavailable" };

  // Check plan limit
  const limit = getProjectLimit(plan);
  const existing = await getUserProjects(userId);
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

  return { ok: true, project: mapProject(data) };
}

/** Update a project's name, description, or industry. */
export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, "name" | "description" | "industry">>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Service unavailable" };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.industry !== undefined) patch.industry = updates.industry?.trim() || null;

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
