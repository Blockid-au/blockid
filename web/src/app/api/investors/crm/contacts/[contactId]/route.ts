// /api/investors/crm/contacts/[contactId] — one contact (S28-B).
//
//   GET   → the contact + its timeline (viewer+)
//   PATCH → partial update (editor+). `stage` writes a `status_change`
//           touchpoint; `archived: true|false` soft-deletes / restores.
//           An email change that collides with another contact on the
//           project answers 409 `duplicate_email`.
//
// No DELETE: a CRM never hard-deletes a relationship — archive keeps the
// touchpoints for the next raise. The row must belong to the resolved
// project — the id is not an oracle.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { parseContactInput, type ContactPatch, type ContactRow } from "@/lib/investors/crm";
import { changeStage, CONTACT_COLUMNS, findContactByEmail, getContact, listTouchpoints, resolveCrmScope } from "@/lib/investors/crm-server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ contactId: string }> };

const notFound = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { contactId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const access = await resolveCrmScope("viewer");
  if (!access.ok) return access.response;
  const contact = await getContact(supabase, access.projectId, contactId);
  if (!contact) return notFound();
  const touchpoints = await listTouchpoints(supabase, access.projectId, contact.id);
  return NextResponse.json({ ok: true, contact, touchpoints });
}

async function PATCH_handler(req: NextRequest, ctx: Ctx) {
  const { contactId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const parsed = parseContactInput(await req.json().catch(() => null), { partial: true });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const patch = parsed.value as ContactPatch;

  const access = await resolveCrmScope("editor");
  if (!access.ok) return access.response;
  const { projectId } = access;

  const existing = await getContact(supabase, projectId, contactId);
  if (!existing) return notFound();

  if (patch.email !== undefined && patch.email && patch.email !== existing.email) {
    const clash = await findContactByEmail(supabase, projectId, patch.email);
    if (clash && clash.id !== existing.id) {
      return NextResponse.json(
        { ok: false, error: "duplicate_email", message: `${clash.name} already has this email on your pipeline`, contactId: clash.id },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.org !== undefined) update.org = patch.org;
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.source !== undefined) update.source = patch.source;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (patch.nextStep !== undefined) update.next_step = patch.nextStep;
  if (patch.nextStepDue !== undefined) update.next_step_due = patch.nextStepDue;
  if (patch.ownerUserId !== undefined) update.owner_user_id = patch.ownerUserId;
  if (patch.archived !== undefined) update.archived_at = patch.archived ? (existing.archived_at ?? now) : null;

  let row: ContactRow = existing;
  if (Object.keys(update).length > 1) {
    const { data, error } = await supabase
      .from("investor_contacts")
      .update(update)
      .eq("id", existing.id)
      .eq("project_id", projectId)
      .select(CONTACT_COLUMNS)
      .maybeSingle();
    if (error) {
      if (String(error.code) === "23505") {
        return NextResponse.json({ ok: false, error: "duplicate_email", message: "A contact with this email already exists on your pipeline" }, { status: 409 });
      }
      console.error("[investors:crm] contact patch failed", error);
      return NextResponse.json({ ok: false, error: "Failed to update contact" }, { status: 500 });
    }
    row = (data as ContactRow | null) ?? ({ ...existing, ...update } as ContactRow);
  }

  // The stage move goes last so the status_change row reflects the edited contact.
  if (patch.stage !== undefined && patch.stage !== existing.stage) {
    row = await changeStage(supabase, { contact: row, to: patch.stage, actorUserId: user.id });
  }

  auditNote(existing.id, {
    project_id: projectId,
    stage: patch.stage ?? null,
    archived: patch.archived ?? null,
    fields: Object.keys(update).filter((k) => k !== "updated_at"),
  });
  return NextResponse.json({ ok: true, contact: row });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/investors/crm/contacts/[contactId]/route.ts", method: "PATCH" }, PATCH_handler);
