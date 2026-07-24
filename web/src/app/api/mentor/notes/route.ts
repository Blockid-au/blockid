// /api/mentor/notes — CRUD for mentor notes.
//
// POST   body { subject_user_id, body, visibility } → creates a note.
// PATCH  body { id, body?, visibility? } → updates fields on a mentor-owned note.
// DELETE body { id } → hard-deletes a mentor-owned note.
//
// mentor_user_id is always derived from the session (never trust the client).
// Every mutation writes a reseller_audit_log row via diffAudit() so the trail
// captures the visibility transition without echoing note content.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { getSupabaseAdmin } from "@/lib/supabase";
import { decideReveal } from "@/lib/reseller/customer-reveal";
import {
  diffAudit,
  validateBody,
  type NoteVisibility,
} from "@/lib/mentor/notes";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mentor/notes";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

function normaliseVisibility(raw: unknown): NoteVisibility | null {
  if (raw === "private" || raw === "shared_with_founder") return raw;
  return null;
}

async function requireScope(user: { id: string } | null) {
  if (!user) return { err: NextResponse.json({ ok: false, reason: "unauthorised" }, { status: 401 }) };
  try {
    const scope = await scopedReseller(user as never);
    return { scope };
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return { err: NextResponse.json({ ok: false, reason: err.code }, { status: 403 }) };
    }
    throw err;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const scoped = await requireScope(user);
  if ("err" in scoped) return scoped.err;
  const scope = scoped.scope;

  const body = (await request.json().catch(() => null)) as
    | { subject_user_id?: unknown; body?: unknown; visibility?: unknown }
    | null;
  if (!body) return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });

  const allowed = await scope.allowedCustomerIds();
  const target = decideReveal(body.subject_user_id, allowed);
  if (!target.ok) {
    const status = target.reason === "not_in_scope" ? 403 : 400;
    return NextResponse.json({ ok: false, reason: target.reason }, { status });
  }

  const v = validateBody(body.body);
  if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: 400 });
  const visibility = normaliseVisibility(body.visibility) ?? "private";

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from("mentor_notes")
    .insert({
      mentor_user_id: user!.id,
      subject_user_id: target.customerId,
      body: v.body,
      visibility,
      created_at: now,
      updated_at: now,
    })
    .select("id, created_at, updated_at, visibility")
    .single();
  if (error || !inserted) {
    return NextResponse.json(
      { ok: false, reason: "insert_failed", error: error?.message ?? "no_row" },
      { status: 500 },
    );
  }

  const db = resellerSupabase(scope);
  const { ip, ua } = readClientMeta(request);
  const diff = diffAudit("create", null, { body: v.body, visibility });
  try {
    await db.auditLog({
      actor_user_id: user!.id,
      subject_user_id: target.customerId,
      action: "mentor_note_create",
      fields: diff.fields,
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: { note_id: inserted.id, visibility },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, reason: "audit_failed", error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, note: inserted });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  const scoped = await requireScope(user);
  if ("err" in scoped) return scoped.err;
  const scope = scoped.scope;

  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; body?: unknown; visibility?: unknown }
    | null;
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const { data: current, error: readErr } = await supabase
    .from("mentor_notes")
    .select("id, mentor_user_id, subject_user_id, body, visibility")
    .eq("id", body.id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, reason: "lookup_failed", error: readErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  if (current.mentor_user_id !== user!.id) {
    return NextResponse.json({ ok: false, reason: "not_owner" }, { status: 403 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let nextBody = current.body as string;
  let nextVisibility = current.visibility as NoteVisibility;
  if (body.body !== undefined) {
    const v = validateBody(body.body);
    if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: 400 });
    patch.body = v.body;
    nextBody = v.body;
  }
  if (body.visibility !== undefined) {
    const nv = normaliseVisibility(body.visibility);
    if (!nv) return NextResponse.json({ ok: false, reason: "invalid_visibility" }, { status: 400 });
    patch.visibility = nv;
    nextVisibility = nv;
  }

  const { data: updated, error: updErr } = await supabase
    .from("mentor_notes")
    .update(patch)
    .eq("id", current.id)
    .eq("mentor_user_id", user!.id)
    .select("id, updated_at, visibility")
    .single();
  if (updErr || !updated) {
    return NextResponse.json({ ok: false, reason: "update_failed", error: updErr?.message ?? "no_row" }, { status: 500 });
  }

  const db = resellerSupabase(scope);
  const { ip, ua } = readClientMeta(request);
  const diff = diffAudit(
    "update",
    { body: current.body as string, visibility: current.visibility as NoteVisibility },
    { body: nextBody, visibility: nextVisibility },
  );
  try {
    await db.auditLog({
      actor_user_id: user!.id,
      subject_user_id: current.subject_user_id as string,
      action: "mentor_note_update",
      fields: diff.fields,
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: {
        note_id: current.id,
        visibility_before: current.visibility,
        visibility_after: nextVisibility,
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, reason: "audit_failed", error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, note: updated });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  const scoped = await requireScope(user);
  if ("err" in scoped) return scoped.err;
  const scope = scoped.scope;

  const url = new URL(request.url);
  const idFromQuery = url.searchParams.get("id");
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : idFromQuery;
  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const { data: current, error: readErr } = await supabase
    .from("mentor_notes")
    .select("id, mentor_user_id, subject_user_id, body, visibility")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, reason: "lookup_failed", error: readErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  if (current.mentor_user_id !== user!.id) {
    return NextResponse.json({ ok: false, reason: "not_owner" }, { status: 403 });
  }

  const { error: delErr } = await supabase
    .from("mentor_notes")
    .delete()
    .eq("id", id)
    .eq("mentor_user_id", user!.id);
  if (delErr) {
    return NextResponse.json({ ok: false, reason: "delete_failed", error: delErr.message }, { status: 500 });
  }

  const db = resellerSupabase(scope);
  const { ip, ua } = readClientMeta(request);
  const diff = diffAudit(
    "delete",
    { body: current.body as string, visibility: current.visibility as NoteVisibility },
    null,
  );
  try {
    await db.auditLog({
      actor_user_id: user!.id,
      subject_user_id: current.subject_user_id as string,
      action: "mentor_note_delete",
      fields: diff.fields,
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: { note_id: current.id },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, reason: "audit_failed", error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted_id: id });
}
