// /api/investors/crm/contacts/[contactId]/touchpoints — the timeline (S28-B).
//
//   GET  → newest first (viewer+)
//   POST → add a manual entry (editor+): kind note|email|call|meeting, body,
//          optional occurredAt (back-dating a call is normal; the future is
//          not). Bumps the contact's `last_touch_at` forward. The system
//          kinds (data_room_view / commitment / status_change) are written
//          by the S26-A hooks and the stage PATCH — never by this route.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { parseTouchpointInput } from "@/lib/investors/crm";
import { appendTouchpoint, getContact, listTouchpoints, resolveCrmScope } from "@/lib/investors/crm-server";

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
  return NextResponse.json({ ok: true, touchpoints });
}

async function POST_handler(req: NextRequest, ctx: Ctx) {
  const { contactId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const parsed = parseTouchpointInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const access = await resolveCrmScope("editor");
  if (!access.ok) return access.response;
  const contact = await getContact(supabase, access.projectId, contactId);
  if (!contact) return notFound();

  const row = await appendTouchpoint(supabase, {
    contact,
    kind: parsed.value.kind,
    body: parsed.value.body,
    occurredAt: parsed.value.occurredAt,
    createdBy: user.id,
  });
  if (!row) return NextResponse.json({ ok: false, error: "Failed to add touchpoint" }, { status: 500 });

  auditNote(row.id || null, { project_id: access.projectId, contact_id: contact.id, kind: parsed.value.kind });
  return NextResponse.json({ ok: true, touchpoint: row }, { status: 201 });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/investors/crm/contacts/[contactId]/touchpoints/route.ts", method: "POST" }, POST_handler);
