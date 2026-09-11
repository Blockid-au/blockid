// PATCH  /api/esop/grants/[id] — update grant status (active / exercised / lapsed).
// DELETE /api/esop/grants/[id] — soft delete (status = 'cancelled').

import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { getGrant, isValidStatus, updateGrantStatus } from "@/lib/esop-grants";
import { DIV83A_DISCLAIMER } from "@/lib/div83a-checker";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await gateRequireFeature("esop.manage");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  // S18-A — editor+; the grant lives under the project OWNER's user_id.
  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  const ownerUserId = scope?.ownerUserId ?? user.id;

  const { id } = await params;
  const existing = await getGrant(id, ownerUserId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Grant not found" }, { status: 404 });
  }

  const body: unknown = await request.json().catch(() => ({}));
  const b = (body ?? {}) as Record<string, unknown>;

  if (!isValidStatus(b.status)) {
    return NextResponse.json(
      {
        ok: false,
        error: "status must be one of: active, exercised, lapsed, cancelled",
      },
      { status: 400 },
    );
  }

  const ok = await updateGrantStatus(id, ownerUserId, b.status);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Failed to update grant" },
      { status: 500 },
    );
  }

  const updated = await getGrant(id, ownerUserId);
  return NextResponse.json({
    ok: true,
    grant: updated,
    disclaimer: DIV83A_DISCLAIMER,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await gateRequireFeature("esop.manage");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  // S18-A — editor+; the grant lives under the project OWNER's user_id.
  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  const ownerUserId = scope?.ownerUserId ?? user.id;

  const { id } = await params;
  const existing = await getGrant(id, ownerUserId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Grant not found" }, { status: 404 });
  }

  const ok = await updateGrantStatus(id, ownerUserId, "cancelled");
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Failed to cancel grant" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    id,
    status: "cancelled",
    disclaimer: DIV83A_DISCLAIMER,
  });
}
