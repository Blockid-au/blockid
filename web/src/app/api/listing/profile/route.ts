// /api/listing/profile — the founder-ticked listing readiness facts (S29-A).
//
//   GET    viewer+ → { facts, updatedAt, role }
//   PATCH  editor+ → body is a partial facts object validated by
//          `parseListingFactsPatch` (unknown key / bad shape → 400; `null`
//          clears a key); upserts `listing_profiles` for the ACTIVE project
//          and returns the stored facts. No credits — facts are free.
//
// Keyed on the project (never the caller): a member edits the OWNER's
// profile through the role table.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { readJsonBody } from "@/lib/security/request-guards";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { parseListingFactsPatch } from "@/lib/listing/profile";
import { loadListingProfile, saveListingFacts } from "@/lib/listing/server";

export const dynamic = "force-dynamic";

const BODY_MAX_BYTES = 16 * 1024;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: true, role: null, facts: {}, updatedAt: null });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const profile = await loadListingProfile(supabase, scope.projectId);
  return NextResponse.json({ ok: true, role: scope.role, facts: profile.facts, updatedAt: profile.updatedAt });
}

async function PATCH_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const read = await readJsonBody<unknown>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseListingFactsPatch(read.body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  if (Object.keys(parsed.patch).length === 0 && parsed.cleared.length === 0) return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const facts = await saveListingFacts(supabase, scope.projectId, parsed.patch, parsed.cleared);
  if (!facts) return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  auditNote(scope.projectId, { keys: [...Object.keys(parsed.patch), ...parsed.cleared] });
  return NextResponse.json({ ok: true, role: scope.role, facts });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/listing/profile/route.ts", method: "PATCH" }, PATCH_handler);
