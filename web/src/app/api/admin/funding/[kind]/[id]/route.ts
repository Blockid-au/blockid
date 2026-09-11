// PATCH /api/admin/funding/[kind]/[id] — human review edit for one au_grants
// (kind=grants) or au_programs (kind=programs) row from /admin/funding.
// GET returns the row for the review drawer.
//
// requireAdmin gate + service-role client (the tables are public-read but
// service-write only, migration 0311). Accepted fields are whitelisted in
// src/lib/funding/admin-patch.ts; every accepted PATCH stamps
// verified_by='human' + last_verified_at=today. T0239 / G11 sprint S2.

import { NextResponse } from "next/server";
import { readJsonBody, rejectCrossSite } from "@/lib/security/request-guards";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { KIND_TABLE, parseFundingKind, validateFundingAdminPatch } from "@/lib/funding/admin-patch";
import { revalidateFundingCatalogue } from "@/lib/funding/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ kind: string; id: string }> };

const BODY_MAX_BYTES = 16 * 1024;

async function gate() {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
    return { user };
  } catch (err) {
    if (err instanceof AdminGateError) {
      return { response: NextResponse.json({ ok: false, reason: err.code }, { status: 401 }) };
    }
    throw err;
  }
}

function resolveTarget(rawKind: string, rawId: string) {
  const kind = parseFundingKind(rawKind);
  if (!kind) return { response: NextResponse.json({ ok: false, reason: "bad_kind" }, { status: 400 }) };
  const id = (rawId ?? "").trim();
  if (!id || id.length > 200) {
    return { response: NextResponse.json({ ok: false, reason: "id_required" }, { status: 400 }) };
  }
  return { kind, id, table: KIND_TABLE[kind] };
}

export async function GET(_request: Request, { params }: Params) {
  const g = await gate();
  if ("response" in g) return g.response;

  const { kind: rawKind, id: rawId } = await params;
  const t = resolveTarget(rawKind, rawId);
  if ("response" in t) return t.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const { data, error } = await supabase.from(t.table).select("*").eq("id", t.id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, reason: "query_failed", error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, kind: t.kind, row: data });
}

export async function PATCH(request: Request, { params }: Params) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;

  const g = await gate();
  if ("response" in g) return g.response;

  const { kind: rawKind, id: rawId } = await params;
  const t = resolveTarget(rawKind, rawId);
  if ("response" in t) return t.response;

  const read = await readJsonBody(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }
  const body: unknown = read.body;

  const v = validateFundingAdminPatch(t.kind, body);
  if (!v.ok) return NextResponse.json({ ok: false, reason: "invalid_patch", error: v.error }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const { data, error } = await supabase
    .from(t.table)
    .update(v.update)
    .eq("id", t.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, reason: "update_failed", error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });

  // S8-D: the directory pages and the preview API read the catalogue through
  // the 1 h data cache — expire it so the reviewer's edit is on the next view.
  revalidateFundingCatalogue();

  return NextResponse.json({ ok: true, kind: t.kind, row: data, applied: v.update });
}
