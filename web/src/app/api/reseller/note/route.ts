// POST /api/reseller/note — write a mentor note against an attributed startup.
//
// v3 upgrade Track K sub-L4. Owner-only. Verifies the target business is
// actually attributed to the caller's reseller before inserting into
// reseller_notes + reseller_activity_signals(kind='noted').
//
// Chokepoint order:
//   1. getCurrentUser()          — session identity
//   2. scopedReseller(user)      — reseller_id membership
//   3. isResellerOwner(...)      — role='owner' gate
//   4. attribution lookup        — business_id ∈ scope.allowedCustomers
//   5. INSERT note + signal in a single request
//
// Errors are returned as { ok:false, reason } with the appropriate HTTP status.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ResellerScopeError, scopedReseller } from "@/lib/reseller/scope";
import { isResellerOwner } from "@/lib/reseller/roster";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    businessId: z.string().uuid(),
    note: z.string().min(1).max(2000),
    visibility: z
      .enum(["reseller_only", "shared_with_founder"])
      .default("reseller_only"),
  })
  .strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "unauthorised" },
      { status: 401 },
    );
  }

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return NextResponse.json(
        { ok: false, reason: "not_reseller" },
        { status: 403 },
      );
    }
    throw err;
  }

  const owner = await isResellerOwner(scope.reseller_id, user.id);
  if (!owner) {
    return NextResponse.json(
      { ok: false, reason: "not_owner" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "bad_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { businessId, note, visibility } = parsed.data;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, reason: "supabase_unavailable" },
      { status: 500 },
    );
  }

  // Attribution check — the business MUST be attributed to this reseller.
  // A project is attributed either directly (subject_type='project') or via
  // its founding user (subject_type='user'). We accept either form.
  const { data: proj, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", businessId)
    .maybeSingle();
  if (projErr || !proj) {
    return NextResponse.json(
      { ok: false, reason: "business_not_found" },
      { status: 404 },
    );
  }

  const { data: attrRows, error: attrErr } = await supabase
    .from("reseller_attributions")
    .select("id, subject_type, subject_user_id, subject_project_id, status, opted_out")
    .eq("reseller_id", scope.reseller_id)
    .eq("status", "active")
    .eq("opted_out", false);
  if (attrErr) {
    return NextResponse.json(
      { ok: false, reason: "db_error" },
      { status: 500 },
    );
  }
  const attributed = (attrRows ?? []).some((row) => {
    if (row.subject_type === "project" && row.subject_project_id === businessId) return true;
    if (row.subject_type === "user" && row.subject_user_id === proj.user_id) return true;
    return false;
  });
  if (!attributed) {
    return NextResponse.json(
      { ok: false, reason: "not_attributed" },
      { status: 403 },
    );
  }

  // Persist note.
  const { data: noteRow, error: noteErr } = await supabase
    .from("reseller_notes")
    .insert({
      reseller_id: scope.reseller_id,
      business_id: businessId,
      author_user_id: user.id,
      note,
      visibility,
    })
    .select("id, created_at")
    .single();
  if (noteErr || !noteRow) {
    return NextResponse.json(
      { ok: false, reason: "insert_failed" },
      { status: 500 },
    );
  }

  // Best-effort activity signal — surface never fails the request.
  await supabase.from("reseller_activity_signals").insert({
    reseller_id: scope.reseller_id,
    business_id: businessId,
    signal_kind: "noted",
    metadata: { note_id: noteRow.id, visibility },
  });

  return NextResponse.json({
    ok: true,
    note_id: noteRow.id,
    created_at: noteRow.created_at,
  });
}
