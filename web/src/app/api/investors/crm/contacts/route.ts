// /api/investors/crm/contacts — the investor pipeline (S28-B).
//
//   GET  → one page (viewer+). Filters: ?stage= ?type= ?tag= ?q= ?archived=1
//          ?limit= ?cursor= (keyset on created_at DESC, id DESC).
//   POST → create a contact (editor+). Email is lower-cased; a second row
//          with the same address on the project answers 409 `duplicate_email`
//          with the existing id, so the client can open it instead.
//
// Everything is keyed on the resolved project (`resolveCrmScope`) — never
// on the caller's own id — so a member sees the owner's pipeline.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { parseContactInput, parseListFilters, type ContactInput } from "@/lib/investors/crm";
import { CONTACT_COLUMNS, findContactByEmail, isProjectMemberOrOwner, listContacts, ownerNotMemberResponse, resolveCrmScope } from "@/lib/investors/crm-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const filters = parseListFilters(new URL(req.url).searchParams);
  if (!filters.ok) return NextResponse.json({ ok: false, error: filters.error }, { status: 400 });

  const access = await resolveCrmScope("viewer");
  if (!access.ok) return access.response;

  const page = await listContacts(supabase, access.projectId, filters.value);
  return NextResponse.json({
    ok: true,
    contacts: page.contacts,
    nextCursor: page.nextCursor,
    role: access.scope.role,
    canEdit: access.scope.role === "owner" || access.scope.role === "admin" || access.scope.role === "editor",
    canExport: access.scope.isOwner,
  });
}

async function POST_handler(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const parsed = parseContactInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const input = parsed.value as ContactInput;

  const access = await resolveCrmScope("editor");
  if (!access.ok) return access.response;
  const { projectId } = access;

  // S29-hardening (S28 review #8): the owner column is attribution to a
  // real teammate — the project owner or an accepted member only.
  if (input.ownerUserId && !(await isProjectMemberOrOwner(supabase, { projectId, ownerUserId: access.ownerUserId, userId: input.ownerUserId }))) {
    return ownerNotMemberResponse();
  }

  if (input.email) {
    const existing = await findContactByEmail(supabase, projectId, input.email);
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "duplicate_email", message: `${existing.name} already has this email on your pipeline`, contactId: existing.id },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("investor_contacts")
    .insert({
      project_id: projectId,
      name: input.name,
      email: input.email,
      org: input.org,
      role: input.role,
      type: input.type,
      stage: input.stage,
      source: input.source ?? "manual",
      tags: input.tags,
      next_step: input.nextStep,
      next_step_due: input.nextStepDue,
      owner_user_id: input.ownerUserId ?? user.id,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    })
    .select(CONTACT_COLUMNS)
    .single();
  if (error) {
    // The partial unique index is the last line of defence against a race.
    if (String(error.code) === "23505") {
      return NextResponse.json({ ok: false, error: "duplicate_email", message: "A contact with this email already exists on your pipeline" }, { status: 409 });
    }
    console.error("[investors:crm] contact insert failed", error);
    return NextResponse.json({ ok: false, error: "Failed to create contact" }, { status: 500 });
  }

  const created = data as { id?: string } | null;
  auditNote(created?.id ?? null, { project_id: projectId, stage: input.stage, type: input.type });
  return NextResponse.json({ ok: true, contact: data }, { status: 201 });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/investors/crm/contacts/route.ts", method: "POST" }, POST_handler);
