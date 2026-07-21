// POST /api/reseller/sandbox/setup
//
// Track A P6.4 — one-time provision of the reseller org's sandbox workspace.
//
// Per docs/plans/reseller-module-plan.md § U.4 (sandbox mechanics), § U.15.2
// (rate limits) and migration 0092 (`projects.reseller_sandbox_id`):
//
//   1. scopedReseller(user) chokepoint (belt-and-braces).
//   2. Only owner/admin roles can provision — viewers are read-only.
//   3. Idempotent: if scope.sandboxProjectId() already exists, return the
//      existing project so client retries are safe (no duplicate rows, no
//      duplicate audit entries).
//   4. Inserts the projects row directly (bypasses createProject() so
//      PLAN_PROJECT_LIMITS does not apply — the reseller org, not a
//      customer subscription tier, owns the sandbox).
//   5. Writes reseller_audit_log(action='provision_sandbox') BEFORE returning.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { gateRequireFeature } from "@/lib/feature-gate";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  buildSandboxProjectInsert,
  canProvisionSandbox,
} from "@/lib/reseller/sandbox-provision";

export const dynamic = "force-dynamic";

const ROUTE = "/api/reseller/sandbox/setup";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

export async function POST(request: Request) {
  const gate = await gateRequireFeature("reseller.console");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 403 });
    }
    throw err;
  }

  if (!canProvisionSandbox(scope.role)) {
    return NextResponse.json(
      { ok: false, reason: "insufficient_role" },
      { status: 403 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const existing = await scope.sandboxProjectId();
  if (existing) {
    return NextResponse.json({
      ok: true,
      project_id: existing,
      already_existed: true,
    });
  }

  const db = resellerSupabase(scope);
  const self = await db.selfReseller();
  if (!self) {
    return NextResponse.json({ ok: false, reason: "reseller_missing" }, { status: 404 });
  }

  const insert = buildSandboxProjectInsert({
    reseller_id: scope.reseller_id,
    reseller_code: self.code as string,
    reseller_display_name: (self.display_name as string) ?? (self.code as string),
    user_id: user.id,
  });

  const { data: projectRow, error: insertErr } = await supabase
    .from("projects")
    .insert(insert)
    .select("id, slug, name")
    .single();
  if (insertErr || !projectRow) {
    // Race: a concurrent request may have provisioned a sandbox between the
    // idempotency check and the insert. Re-scan and return the winner.
    if (insertErr?.code === "23505") {
      const winner = await scope.sandboxProjectId();
      if (winner) {
        return NextResponse.json({
          ok: true,
          project_id: winner,
          already_existed: true,
        });
      }
    }
    return NextResponse.json(
      {
        ok: false,
        reason: "insert_failed",
        error: insertErr?.message ?? "no_row",
      },
      { status: 500 },
    );
  }

  const { ip, ua } = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      subject_user_id: null,
      action: "provision_sandbox",
      fields: ["project_id"],
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: {
        project_id: projectRow.id,
        slug: projectRow.slug,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "audit_failed", error: (err as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    project_id: projectRow.id as string,
    slug: projectRow.slug as string,
    name: projectRow.name as string,
    already_existed: false,
  });
}
