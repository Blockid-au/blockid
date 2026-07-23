// POST /api/esop/div83a-check — run the AU Startup Concession (Div 83A)
// checker for a given grant. Persists the result and updates the grant's
// cached div83a_status. General information only — not legal or tax advice.

import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";
import {
  checkDiv83A,
  DIV83A_DISCLAIMER,
  type Div83AProjectInput,
} from "@/lib/div83a-checker";
import { getGrant, updateDiv83AStatus } from "@/lib/esop-grants";

export const dynamic = "force-dynamic";

interface CheckBody {
  grantId?: string;
  project?: Div83AProjectInput;
  granteePostGrantOwnershipPct?: number;
}

export async function POST(request: Request) {
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

  const grant = await getGrant(grantId, user.id);
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
  const projectId = await getProjectIdFromRequest();
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
    await updateDiv83AStatus(grant.id, user.id, result.status);
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
