// Generic CRUD helper for project-scoped founder-feature tables. Keeps every
// /api/founder/* route thin (list + create + patch + delete) without
// duplicating auth/db/project boilerplate five times over.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";

export interface CrudConfig {
  table: string;
  fields: Set<string>;                     // allow-list of column names
  requiredFields?: string[];               // must be present + non-empty on POST
  orderBy?: { column: string; ascending?: boolean }[];
}

export function listHandler(cfg: CrudConfig) {
  return async () => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
    const sb = getSupabaseAdmin();
    if (!sb) return NextResponse.json({ ok: false, error: "db" }, { status: 503 });
    const projectId = await getProjectIdFromRequest();
    if (!projectId) return NextResponse.json({ ok: true, items: [] });

    let query = sb
      .from(cfg.table)
      .select("*")
      .eq("user_id", user.id)
      .eq("project_id", projectId);
    for (const o of cfg.orderBy ?? [{ column: "created_at", ascending: true }]) {
      query = query.order(o.column, { ascending: o.ascending ?? true });
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, items: data ?? [] });
  };
}

export function createHandler(cfg: CrudConfig) {
  return async (req: NextRequest) => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
    const sb = getSupabaseAdmin();
    if (!sb) return NextResponse.json({ ok: false, error: "db" }, { status: 503 });
    const projectId = await getProjectIdFromRequest();
    if (!projectId) return NextResponse.json({ ok: false, error: "no project" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
    }
    for (const rf of cfg.requiredFields ?? []) {
      const v = body[rf];
      if (v === undefined || v === null || v === "") {
        return NextResponse.json({ ok: false, error: `${rf} required` }, { status: 400 });
      }
    }
    const payload: Record<string, unknown> = { user_id: user.id, project_id: projectId };
    for (const [k, v] of Object.entries(body)) {
      if (cfg.fields.has(k)) payload[k] = v === "" ? null : v;
    }

    const { data, error } = await sb.from(cfg.table).insert(payload).select("*").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  };
}

export function patchHandler(cfg: CrudConfig) {
  return async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
    const sb = getSupabaseAdmin();
    if (!sb) return NextResponse.json({ ok: false, error: "db" }, { status: 503 });

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
    }
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (cfg.fields.has(k)) payload[k] = v === "" ? null : v;
    }
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
    }

    const { data, error } = await sb
      .from(cfg.table)
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  };
}

export function deleteHandler(cfg: CrudConfig) {
  return async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
    const sb = getSupabaseAdmin();
    if (!sb) return NextResponse.json({ ok: false, error: "db" }, { status: 503 });

    const { error } = await sb
      .from(cfg.table)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  };
}
