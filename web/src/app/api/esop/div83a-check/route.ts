// POST /api/esop/div83a-check — run the AU Startup Concession (Div 83A)
// checker for a given grant. Persists the result and updates the grant's
// cached div83a_status. General information only — not legal or tax advice.

import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import {
  checkDiv83A,
  DIV83A_DISCLAIMER,
  type Div83AProjectInput,
} from "@/lib/div83a-checker";
import { getGrant, updateDiv83AStatus } from "@/lib/esop-grants";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

interface CheckBody {
  grantId?: string;
  project?: Div83AProjectInput;
  granteePostGrantOwnershipPct?: number;
}

async function POST_handler(request: Request) {
  const gate = await gateRequireFeature("esop.manage");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  const body = (await request.json().catch(() => ({}))) as CheckBody;
  const grantId = typeof body.grantId === "string" ? body.grantId : null;
  if (!grantId) {
    return NextResponse.json(
      { ok: false, error: "grantId is required" },
      { status: 400 },
    );
  }

  // S18-A — editor+ (persists a Div83A check and updates the grant); the
  // grant is looked up under the project OWNER's user_id AND the active
  // project_id (review P1-1: a foreign-project grant id → 404).
  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  const ownerUserId = scope?.ownerUserId ?? user.id;
  const projectId = scope?.projectId ?? null;

  const grant = await getGrant(grantId, ownerUserId, projectId);
  if (!grant) {
    return NextResponse.json(
      { ok: false, error: "Grant not found" },
      { status: 404 },
    );
  }

  // Enrich the project payload with anything we can infer from the
  // active project row (e.g. incorporationDate → project.incorporatedAt),
  // otherwise trust the client-supplied values.
  const supabase = getSupabaseAdmin();
  const projectPayload: Div83AProjectInput = { ...(body.project ?? {}) };

  if (supabase && projectId) {
    const { data: proj } = await supabase
      .from("projects")
      .select("industry, stage")
      .eq("id", projectId)
      .maybeSingle();
    // Nothing to derive here today; kept for forward-compat when the
    // projects table grows incorporation/turnover fields.
    void proj;
  }

  const ownership =
    typeof body.granteePostGrantOwnershipPct === "number"
      ? body.granteePostGrantOwnershipPct
      : undefined;

  const result = checkDiv83A(
    {
      grantDate: grant.grantDate,
      strikePriceAud: grant.strikePriceAud,
      vestingYears: grant.vestingYears,
      cliffMonths: grant.cliffMonths,
    },
    projectPayload,
    ownership,
  );

  // Persist — best-effort. The response is never blocked on storage.
  if (supabase) {
    const { error: insertErr } = await supabase
      .from("esop_option_div83a_checks")
      .insert({
        grant_id: grant.id,
        status: result.status,
        criteria: result.criteria,
        guidance: result.guidance,
      });
    if (insertErr) {
      console.error("[div83a-check] persist failed", insertErr.message);
    }
    await updateDiv83AStatus(grant.id, ownerUserId, result.status, projectId);
  }

  return NextResponse.json({
    ok: true,
    grantId: grant.id,
    status: result.status,
    criteria: result.criteria,
    guidance: result.guidance,
    qualifying_tests: result.qualifying_tests,
    disclaimer: DIV83A_DISCLAIMER,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/esop/div83a-check/route.ts", method: "POST" }, POST_handler);
